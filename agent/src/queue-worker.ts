import type { AgentConfig } from "./config.ts";
import { claimJobs, reportComplete, reportFailure } from "./client.ts";
import { renderEscPos } from "./escpos.ts";
import { sendToPrinter } from "./printer.ts";

export type PollResult = { claimed: number; printed: number; failed: number };

/** One claim -> print -> report cycle. Mirrors the shape of this repo's own notification worker (poll, process, report), with the printer instead of an SMTP send as the side effect that can fail. */
export async function pollOnce(config: AgentConfig): Promise<PollResult> {
  const jobs = await claimJobs(config);
  let printed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const bytes = renderEscPos(job.document);
      await sendToPrinter(config.printerHost, config.printerPort, bytes);
      await reportComplete(config, job.id);
      printed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Best-effort: if reporting the failure itself fails (server also
      // down), the job's lease simply expires server-side and another
      // poll reclaims it later — see lib/printing/queue.ts's own comment.
      await reportFailure(config, job.id, message).catch(() => {});
      failed += 1;
    }
  }

  return { claimed: jobs.length, printed, failed };
}
