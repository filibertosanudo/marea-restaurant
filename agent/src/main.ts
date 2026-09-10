/**
 * Long-running mode: poll -> print -> sleep, forever. Same shape as this
 * repo's scripts/worker.ts, for the same reason: SIGTERM/SIGINT stop
 * claiming new batches but let a batch already in flight finish, which is
 * what releases its jobs' leases normally. A process killed outright
 * (power loss, SIGKILL) is recovered later by the server's own lease
 * timeout — see lib/printing/queue.ts's header comment on the server side
 * of this repo.
 *
 *   npm start
 */
import { loadConfig } from "./config.ts";
import { pollOnce } from "./queue-worker.ts";

let shuttingDown = false;
let wake: (() => void) | null = null;

function requestShutdown(signal: string) {
  console.log(`[print-agent] received ${signal}, finishing the current batch`);
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
  const config = loadConfig();
  console.log(
    `[print-agent] started — server ${config.serverUrl}, printer ${config.printerHost}:${config.printerPort}`
  );

  while (!shuttingDown) {
    try {
      const result = await pollOnce(config);
      if (result.claimed > 0) {
        console.log(`[print-agent] claimed=${result.claimed} printed=${result.printed} failed=${result.failed}`);
      }
    } catch (err) {
      console.error("[print-agent] poll error:", err instanceof Error ? err.message : err);
    }
    if (shuttingDown) break;
    await sleep(config.pollIntervalMs);
  }

  console.log("[print-agent] shut down cleanly");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
