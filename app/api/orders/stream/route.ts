import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getRealtimeHub } from "@/lib/realtime/runtime";
import type { Subscription } from "@/lib/realtime/hub";
import type { RealtimeEvent } from "@/lib/realtime/events";
import { SSE_COALESCE_MS } from "@/lib/realtime/timing";

// A periodic handoff (env.SSE_MAX_LIFETIME_MS, 0 to disable) keeps a
// connection left open for a whole shift from wedging a proxy or load
// balancer that expects streams to end sometime. EventSource reconnects on
// its own, and useEventStream's backoff treats this exactly like any other
// dropped connection — so it costs nothing to close cleanly.

/** Idle keep-alive: keeps a proxy or load balancer from timing out a quiet stream. */
const KEEP_ALIVE_MS = 20_000;

/** A burst bigger than this is sent as "reconcile" instead of listing every change. */
const MAX_EVENTS_PER_UPDATE = 50;

/**
 * The push channel for the board, the kitchen screen and order tracking. It
 * used to poll the database itself every 2 s per connected screen; now it
 * subscribes to the process-wide hub (lib/realtime/hub.ts), which listens to
 * Postgres notifications, or polls once for everyone when it cannot.
 *
 * What goes down the wire is never order data: at most which order changed
 * and its new status, for staff. A tracked order's page gets a bare "update"
 * for its own order only. The client re-reads through the normal,
 * already-authorized page render.
 */
export async function GET(request: NextRequest) {
  const publicToken = request.nextUrl.searchParams.get("token");

  let scope: Subscription;
  let isStaff: boolean;
  if (publicToken) {
    const business = await getCurrentBusiness();
    const order = await prisma.order.findFirst({
      where: { businessId: business.id, publicToken },
      select: { id: true },
    });
    if (!order) return new Response("Not found", { status: 404 });
    scope = { businessId: business.id, orderId: order.id };
    isStaff = false;
  } else {
    const session = await getSession();
    if (!session?.user || session.user.revoked || !STAFF_ROLES.includes(session.user.role)) {
      return new Response("Forbidden", { status: 403 });
    }
    const business = await getCurrentBusiness();
    scope = { businessId: business.id };
    isStaff = true;
  }

  const encoder = new TextEncoder();
  let closed = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let unsubscribe: (() => void) | null = null;

  // Everything that must stop when the stream ends, however it ends.
  const release = () => {
    closed = true;
    unsubscribe?.();
    for (const timer of timers) {
      // setInterval and setTimeout ids are interchangeable for clearing.
      clearTimeout(timer);
      clearInterval(timer);
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        release();
        try {
          controller.close();
        } catch {
          // already closed by the runtime — nothing to do
        }
      };
      request.signal.addEventListener("abort", close);

      // Several triggers fire for one order (its status event, its payment):
      // send them as one update so a screen refreshes once, not three times.
      let pending: RealtimeEvent[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        const batch = pending;
        pending = [];
        if (batch.length === 0) return;
        send(`event: update\ndata: ${JSON.stringify(describeBatch(batch, isStaff))}\n\n`);
      };

      unsubscribe = getRealtimeHub().subscribe(scope, (event) => {
        pending.push(event);
        if (!flushTimer) {
          flushTimer = setTimeout(flush, SSE_COALESCE_MS);
          timers.push(flushTimer);
        }
      });

      // Flushes the headers so the client's EventSource opens right away.
      send(": connected\n\n");

      timers.push(setInterval(() => send(": ping\n\n"), KEEP_ALIVE_MS));

      if (env.SSE_MAX_LIFETIME_MS > 0) {
        timers.push(
          setTimeout(() => {
            // A plain close() here would look identical to a real drop to the
            // client: EventSource fires the same "error" event for any
            // server-initiated close, so useEventStream would flip to
            // "offline" every ~75s on a healthy connection. Telling the
            // client first lets it close and reconnect itself instead — a
            // client-initiated close() never fires "error" — so the scheduled
            // handoff never shows as an outage on a kitchen display that's
            // read at a glance, not debugged.
            send(`event: reconnect\ndata: ${Date.now()}\n\n`);
            close();
          }, env.SSE_MAX_LIFETIME_MS)
        );
      }
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** The body of one `update` event. Staff learn which order changed; a guest tracking an order learns only that something did. */
function describeBatch(batch: RealtimeEvent[], isStaff: boolean) {
  if (!isStaff) return {};
  const changes = batch.flatMap((e) => (e.kind === "reconcile" ? [] : [{ kind: e.kind, orderId: e.orderId, status: e.status }]));
  // A reconcile in the batch, or too many changes to list: say "refresh" instead.
  if (changes.length < batch.length || batch.length > MAX_EVENTS_PER_UPDATE) return { reconcile: true };
  return { changes };
}
