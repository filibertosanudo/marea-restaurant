/**
 * Restores the newest backup into a disposable Postgres and checks it, then
 * reports how long that took. Runs monthly in CI (.github/workflows/restore-test.yml)
 * and by hand before trusting a new setup. Needs docker (it starts and removes
 * its own database), age, pg_restore 17 and tar: the `ops` image has them.
 *
 *   npm run ops:restore-test
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { readRestoreTestConfig, runRestoreTest } from "../../lib/ops/restore-test";

async function main() {
  const config = readRestoreTestConfig(process.env);
  const report = await runRestoreTest(config);
  const json = JSON.stringify(report, null, 2);
  console.log(json);

  if (process.env.RESTORE_REPORT_FILE) writeFileSync(process.env.RESTORE_REPORT_FILE, json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const phases = Object.entries(report.phaseSeconds)
      .map(([name, seconds]) => `${name} ${seconds}s`)
      .join(", ");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `## Restore test: ${report.ok ? "passed" : "FAILED"}`,
        `- Recovery time: **${report.totalSeconds} s** (${phases})`,
        `- Backup: ${report.backup.tier}/${report.backup.slot}, ${report.backup.ageHours} h old, ${report.backup.bytes} bytes, app ${report.backup.appVersion}, last migration ${report.backup.lastMigration}`,
        ...report.problems.map((p) => `- Problem: ${p}`),
        "",
      ].join("\n")
    );
  }

  if (!report.ok) {
    console.error(`[ops:restore-test] FAILED:\n  ${report.problems.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  // The dead man's switch: only a passing test pings, so silence means it did
  // not run or did not pass.
  if (config.RESTORE_MONITOR_URL) {
    await fetch(config.RESTORE_MONITOR_URL, { method: "POST", body: json, signal: AbortSignal.timeout(10_000) }).catch((err: unknown) =>
      console.warn(`[ops:restore-test] monitor ping failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
}

main().catch((err) => {
  console.error(`[ops:restore-test] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
