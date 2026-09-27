/**
 * Monthly: counts guest rows overdue for anonymize-old-guests.ts and, if any
 * business has some, emails OPS_ALERT_EMAIL a report with the per-business
 * counts and the exact command. Sends nothing when nothing is overdue.
 * Never anonymizes anything — that command stays a human decision on
 * purpose (see scripts/anonymize-old-guests.ts's own header comment); this
 * only makes sure someone is told it's due.
 *
 *   npm run ops:anonymize-alert
 */
import "dotenv/config";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { sendAnonymizeAlert } from "../../lib/ops/anonymize-alert";
import { runScheduled } from "../../lib/ops/scheduled-task";

async function main() {
  if (!env.OPS_ALERT_EMAIL) {
    console.log("[ops:anonymize-alert] OPS_ALERT_EMAIL is not set: nothing to send to, skipping.");
    return;
  }
  const outcome = await runScheduled("anonymize-alert", "monthly", env.OPS_MONITOR_ANONYMIZE_ALERT_URL, async () => {
    const result = await sendAnonymizeAlert(env.OPS_ALERT_EMAIL!);
    return {
      processed: result.totalRows,
      detail: result.sent
        ? `Sent: ${result.overdueBusinesses} business(es), ${result.totalRows} row(s) overdue.`
        : "Nothing overdue: no email sent.",
    };
  });
  console.log(`[ops:anonymize-alert] ${outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
