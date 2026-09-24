import "server-only";
import pg from "pg";
import { env } from "@/lib/env";
import { RealtimeHub } from "@/lib/realtime/hub";
import { ListenSource } from "@/lib/realtime/listen-source";
import { PollSource } from "@/lib/realtime/poll-source";
import { sweepChangesSince } from "@/lib/realtime/sweep";
import { getBoardSignature } from "@/lib/realtime/signature";
import { POLL_FALLBACK_INTERVAL_MS } from "@/lib/realtime/timing";

/** Shown in pg_stat_activity, so an operator can tell this connection from the pool's. */
export const LISTEN_APPLICATION_NAME = "marea_realtime_listen";

/**
 * The dedicated connection: a plain node-postgres Client, deliberately not
 * from Prisma's pool (a pooled connection is handed back and forth, and LISTEN
 * belongs to one session for its whole life) and not through a transaction-mode
 * pooler (see DIRECT_URL in lib/env.ts). keepAlive lets the OS notice a dead
 * peer sooner; the heartbeat covers what it does not.
 */
export function createListenClient(applicationName: string = LISTEN_APPLICATION_NAME): pg.Client {
  return new pg.Client({
    connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
    application_name: applicationName,
    keepAlive: true,
    connectionTimeoutMillis: 5_000,
  });
}

// One hub per process, whichever bundle asks: Next can evaluate this module
// once for instrumentation and again for a route, and two hubs would mean two
// LISTEN connections. Same pattern lib/prisma.ts uses.
const globalForRealtime = globalThis as unknown as { mareaRealtimeHub?: RealtimeHub };

export function getRealtimeHub(): RealtimeHub {
  if (!globalForRealtime.mareaRealtimeHub) {
    globalForRealtime.mareaRealtimeHub = new RealtimeHub({
      mode: env.REALTIME_MODE,
      createListen: () =>
        new ListenSource({
          createClient: () => createListenClient(),
          sweep: sweepChangesSince,
        }),
      createPoll: (businesses, emit) =>
        new PollSource({
          businesses,
          signature: getBoardSignature,
          onChange: emit,
          intervalMs: POLL_FALLBACK_INTERVAL_MS,
        }),
    });
  }
  return globalForRealtime.mareaRealtimeHub;
}
