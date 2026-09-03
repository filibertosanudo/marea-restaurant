import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

const POLL_INTERVAL_MS = 2000;
// A periodic handoff (env.SSE_MAX_LIFETIME_MS, 0 to disable) keeps a
// connection left open for a whole shift from wedging a proxy or load
// balancer that expects streams to end sometime. EventSource reconnects on
// its own, and useEventStream's backoff treats this exactly like any other
// dropped connection — so it costs nothing to close cleanly.

type Scope = { kind: "board"; businessId: string } | { kind: "order"; orderId: string };

/**
 * A cheap fingerprint of "has anything this scope cares about changed" —
 * never the actual order data (the client re-fetches that through the
 * normal, already-authorized page render via router.refresh()). For the
 * board: the latest OrderStatusEvent (catches new orders and every status
 * transition) plus the latest Payment update (catches collectCashPaymentAction,
 * which touches Payment but not Order — an OrderStatusEvent-only signature
 * would miss a cash collection landing on the board). For a single tracked
 * order: its own status + updatedAt is enough.
 */
async function getSignature(scope: Scope): Promise<string | null> {
  if (scope.kind === "order") {
    const order = await prisma.order.findUnique({
      where: { id: scope.orderId },
      select: { status: true, updatedAt: true },
    });
    return order ? `${order.status}:${order.updatedAt.getTime()}` : null;
  }

  const [latestEvent, latestPayment] = await Promise.all([
    prisma.orderStatusEvent.findFirst({
      where: { order: { businessId: scope.businessId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.payment.findFirst({
      where: { businessId: scope.businessId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true },
    }),
  ]);
  return `${latestEvent?.id ?? "-"}:${latestPayment?.id ?? "-"}:${latestPayment?.updatedAt.getTime() ?? "-"}`;
}

/**
 * Server-side polling dressed up as a push: no LISTEN/NOTIFY (doesn't
 * survive Supabase's transaction-mode pooler in production) and no
 * Supabase Realtime (unavailable against the local Postgres dev runs
 * against). Polls every 2s and only emits when the signature actually
 * changed, so the client isn't refetching the page on every tick, just
 * when there's something new to show.
 */
export async function GET(request: NextRequest) {
  const publicToken = request.nextUrl.searchParams.get("token");

  let scope: Scope;
  if (publicToken) {
    const business = await getCurrentBusiness();
    const order = await prisma.order.findFirst({
      where: { businessId: business.id, publicToken },
      select: { id: true },
    });
    if (!order) return new Response("Not found", { status: 404 });
    scope = { kind: "order", orderId: order.id };
  } else {
    const session = await getSession();
    if (!session?.user || session.user.revoked || !STAFF_ROLES.includes(session.user.role)) {
      return new Response("Forbidden", { status: 403 });
    }
    const business = await getCurrentBusiness();
    scope = { kind: "board", businessId: business.id };
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the runtime — nothing to do
        }
      };
      request.signal.addEventListener("abort", close);

      let lastSignature: string | null = null;
      try {
        lastSignature = await getSignature(scope);
      } catch {
        lastSignature = null;
      }

      const deadline = env.SSE_MAX_LIFETIME_MS > 0 ? Date.now() + env.SSE_MAX_LIFETIME_MS : Infinity;

      while (!closed) {
        if (Date.now() >= deadline) {
          // A plain close() here would look identical to a real drop to the
          // client: EventSource fires the same "error" event for any
          // server-initiated close, so useEventStream would flip to
          // "offline" every ~75s on a healthy connection. Telling the
          // client first lets it close and reconnect itself instead — a
          // client-initiated close() never fires "error" — so the scheduled
          // handoff never shows as an outage on a kitchen display that's
          // read at a glance, not debugged.
          controller.enqueue(encoder.encode(`event: reconnect\ndata: ${Date.now()}\n\n`));
          close();
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (closed) break;

        try {
          const signature = await getSignature(scope);
          if (signature !== lastSignature) {
            lastSignature = signature;
            controller.enqueue(encoder.encode(`event: update\ndata: ${Date.now()}\n\n`));
          } else {
            // Keep-alive comment line — invisible to EventSource's message
            // handling, just keeps proxies/load balancers from timing out
            // an idle connection.
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch {
          // A transient DB hiccup shouldn't drop the connection — just
          // skip this tick and try again next poll.
        }
      }
    },
    cancel() {
      closed = true;
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
