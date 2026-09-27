/**
 * The scheduled backup. Dumps the database as its owner, encrypts, and uploads
 * to the object-locked bucket. Reads its settings from the environment only,
 * by the BACKUP_* names in lib/ops/backup-config.ts; deliberately no dotenv.
 *
 *   npm run ops:backup
 */
import pg from "pg";
import { readBackupConfig } from "../../lib/ops/backup-config";
import { runBackup } from "../../lib/ops/backup";

async function main() {
  const config = readBackupConfig(process.env);
  const client = new pg.Client({ connectionString: config.BACKUP_DATABASE_URL });
  await client.connect();
  try {
    const outcome = await runBackup(client, config);
    console.log(`[ops:backup] ${outcome}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[ops:backup] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
