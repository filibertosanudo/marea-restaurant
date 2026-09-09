/**
 * Long-running mode of the notification queue: poll -> process -> sleep,
 * forever. The serverless alternative (app/api/cron/notifications/route.ts)
 * calls the exact same processQueue() once per invocation instead — see
 * that file and lib/notifications/queue.ts's own header comment for why
 * hosting choice never reaches the queue logic itself.
 *
 * SIGTERM/SIGINT: stop claiming new batches, but never abandon one already
 * claimed — sendOne()/markSent()/markFailedOrRetry() inside the current
 * processQueue() call are allowed to finish, which is what releases their
 * jobs' leases normally. A batch that's still mid-flight when the process
 * is killed outright (SIGKILL, OOM) is recovered later by claimBatch()'s
 * own lease-timeout, not by anything in this file.
 *
 *   npm run notifications:worker
 */
import "dotenv/config";
import { processQueue } from "../lib/notifications/queue";
import { prisma } from "../lib/prisma";

const BATCH_LIMIT = 20;
const POLL_INTERVAL_MS = 5_000;

let shuttingDown = false;
let wake: (() => void) | null = null;

function requestShutdown(signal: string) {
  console.log(`[notifications worker] received ${signal}, finishing the current batch`);
  shuttingDown = true;
  wake?.();
}

process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    wake = resolve;
    setTimeout(resolve, ms);
  });
}

async function main() {
  console.log("[notifications worker] started");
  while (!shuttingDown) {
    const result = await processQueue(BATCH_LIMIT);
    if (result.claimed > 0) {
      console.log(
        `[notifications worker] claimed=${result.claimed} sent=${result.sent} failed=${result.failed}`
      );
    }
    if (shuttingDown) break;
    if (result.claimed === 0) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log("[notifications worker] shut down cleanly");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
