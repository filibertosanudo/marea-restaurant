/**
 * Real recovery: restores a backup into a new, EMPTY Postgres cluster, then
 * proves the application can use it. This is the procedure docs/RUNBOOK.md
 * walks through; the monthly restore test (ops:restore-test) exercises the
 * same functions against a disposable database.
 *
 * Everything it needs is named on purpose. It reads no .env and infers no
 * target: RESTORE_TARGET_ADMIN_URL is where the data goes, and it refuses a
 * database that already exists.
 *
 *   RESTORE_TARGET_ADMIN_URL   owner-role connection to the new cluster's
 *                              maintenance database (the role must be named
 *                              like the backup's owner: the manifest says which)
 *   RESTORE_TARGET_DATABASE    name to create (default: marea)
 *   APP_DB_PASSWORD, WORKER_DB_PASSWORD   the passwords marea_app / marea_worker get
 *   RESTORE_MEDIA_DIR          where to unpack the media archive, if the backup has one
 *   RESTORE_SLOT               a specific slot (default: the newest in the tier)
 *   RESTORE_S3_*, RESTORE_AGE_IDENTITY(_FILE), RESTORE_TIER   as for the restore test
 *
 *   npm run ops:restore
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { readRestoreTestConfig } from "../../lib/ops/restore-test";
import { decrypt, fetchBackup, findLatestSlot, restoreDatabase, restoreMedia } from "../../lib/ops/restore";
import { verifyRestore } from "../../lib/ops/restore-verify";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const started = Date.now();
  const config = readRestoreTestConfig(process.env);
  const adminUrl = required("RESTORE_TARGET_ADMIN_URL");
  const database = process.env.RESTORE_TARGET_DATABASE || "marea";
  const appPassword = required("APP_DB_PASSWORD");
  const workerPassword = required("WORKER_DB_PASSWORD");

  const workDir = await mkdtemp(join(tmpdir(), "marea-restore-"));
  try {
    let identityFile = config.RESTORE_AGE_IDENTITY_FILE;
    if (!identityFile) {
      identityFile = join(workDir, "identity.txt");
      await writeFile(identityFile, `${config.RESTORE_AGE_IDENTITY}\n`, { mode: 0o600 });
    }
    const reader = {
      bucket: config.RESTORE_S3_BUCKET,
      s3: new S3Client({
        endpoint: config.RESTORE_S3_ENDPOINT,
        region: config.RESTORE_S3_REGION,
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: config.RESTORE_S3_ACCESS_KEY_ID,
          secretAccessKey: config.RESTORE_S3_SECRET_ACCESS_KEY,
          sessionToken: config.RESTORE_S3_SESSION_TOKEN,
        },
      }),
    };

    const slot = process.env.RESTORE_SLOT || (await findLatestSlot(reader, config.RESTORE_TIER));
    if (!slot) throw new Error(`there is no backup in ${config.RESTORE_TIER}/`);
    const fetched = await fetchBackup(reader, config.RESTORE_TIER, slot, join(workDir, "download"));
    const { manifest } = fetched;
    console.log(`[ops:restore] ${config.RESTORE_TIER}/${slot}: taken ${manifest.createdAt}, app ${manifest.appVersion}, last migration ${manifest.lastMigration}`);

    const dumpPath = join(workDir, "db.dump");
    await decrypt(fetched.files["db.dump.age"], identityFile, dumpPath);
    const urls = await restoreDatabase({ adminUrl, database, appPassword, workerPassword }, dumpPath, manifest);

    let mediaDir: string | undefined;
    if (fetched.files["media.tar.age"]) {
      mediaDir = required("RESTORE_MEDIA_DIR");
      await decrypt(fetched.files["media.tar.age"], identityFile, join(workDir, "media.tar"));
      await restoreMedia(join(workDir, "media.tar"), mediaDir);
    }

    const report = await verifyRestore({ ownerUrl: urls.ownerUrl, appUrl: urls.appUrl, migrationsDir: config.RESTORE_MIGRATIONS_DIR, mediaDir });
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    console.log(JSON.stringify({ seconds, migrations: report.migrations, media: report.media, problems: report.problems }, null, 2));
    if (report.problems.length > 0) {
      console.error(`[ops:restore] restored, but the checks failed:\n  ${report.problems.join("\n  ")}`);
      process.exitCode = 1;
      return;
    }
    if (report.migrations.pending.length > 0) {
      console.log(`[ops:restore] ${report.migrations.pending.length} migration(s) newer than this backup are pending: run \`prisma migrate deploy\` with the new version.`);
    }
    console.log(`[ops:restore] done in ${seconds} s. Point DATABASE_URL at marea_app and WORKER_DATABASE_URL at marea_worker on database "${database}".`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[ops:restore] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
