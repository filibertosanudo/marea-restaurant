import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBackup, s3ClientFor } from "./backup";
import { configureBackupBucket, readOnlyPolicy, writeOnlyPolicy } from "./backup-bucket";
import { readBackupConfig, type BackupConfig } from "./backup-config";
import { assertDisposable, RESTORE_TEST_LABEL } from "./disposable-postgres";
import { fetchBackup, findLatestSlot, type Reader } from "./restore";
import { readRestoreTestConfig, runRestoreTest } from "./restore-test";

// The whole recovery path against real things: a backup made by the backup
// code, an object-locked bucket (MinIO), age, pg_restore 17 and a disposable
// Postgres started through docker. Skipped unless the variables are set and
// docker answers; CI runs it inside the ops image with the docker socket (the
// `ops` job), the same way the monthly restore test runs.
const endpoint = process.env.OPS_TEST_S3_ENDPOINT;
const adminKey = process.env.OPS_TEST_S3_ADMIN_KEY;
const adminSecret = process.env.OPS_TEST_S3_ADMIN_SECRET;
const adminDatabaseUrl = process.env.OPS_TEST_ADMIN_DATABASE_URL;
const enabled = Boolean(endpoint && adminKey && adminSecret && adminDatabaseUrl && process.env.OPS_TEST_DOCKER === "1");

const id = Date.now().toString(36);
const database = `ops_restore_${id}`;
const bucket = `ops-restore-${id}`;
const MEDIA_KEY = "menu/restored.jpg";

describe.skipIf(!enabled)("restoring a backup into an empty cluster", () => {
  let workDir: string;
  let source: pg.Client;
  let sourceUrl: string;
  let backupConfig: BackupConfig;
  let identity: string;
  let recipient: string;
  let readerCredentials: { key: string; secret: string; token: string };
  let reader: Reader;
  let writer: S3Client;
  let firstSlot: string;

  const restoreEnv = () => ({
    RESTORE_S3_ENDPOINT: endpoint,
    RESTORE_S3_BUCKET: bucket,
    RESTORE_S3_ACCESS_KEY_ID: readerCredentials.key,
    RESTORE_S3_SECRET_ACCESS_KEY: readerCredentials.secret,
    RESTORE_S3_SESSION_TOKEN: readerCredentials.token,
    RESTORE_AGE_IDENTITY: identity,
    RESTORE_MIGRATIONS_DIR: join(process.cwd(), "prisma", "migrations"),
  });

  async function credentialsFor(policy: object) {
    const sts = new STSClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: adminKey!, secretAccessKey: adminSecret! } });
    const { Credentials } = await sts.send(
      new AssumeRoleCommand({ RoleArn: "arn:xxx:xxx:xxx:xxxx", RoleSessionName: "ops-test", Policy: JSON.stringify(policy), DurationSeconds: 3600 })
    );
    return { key: Credentials!.AccessKeyId!, secret: Credentials!.SecretAccessKey!, token: Credentials!.SessionToken! };
  }

  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), "ops-restore-"));
    const mediaDir = join(workDir, "media");
    mkdirSync(join(mediaDir, "menu"), { recursive: true });
    writeFileSync(join(mediaDir, MEDIA_KEY), "not really a jpeg");

    const superClient = new pg.Client({ connectionString: adminDatabaseUrl });
    await superClient.connect();
    await superClient.query(`CREATE DATABASE "${database}"`);
    await superClient.end();
    const url = new URL(adminDatabaseUrl!);
    url.pathname = `/${database}`;
    sourceUrl = url.toString();
    const env = { ...process.env, DATABASE_URL: sourceUrl, DIRECT_URL: sourceUrl, I_KNOW_WHAT_IM_DOING: "1" };
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "ignore", shell: true });
    // The same two-business example the other tests use: several businesses is
    // what makes "marea_app sees what the owner sees" a real comparison.
    execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "ignore", shell: true });
    source = new pg.Client({ connectionString: sourceUrl });
    await source.connect();
    await source.query(`UPDATE "MenuItem" SET "imageUrl" = $1 WHERE id = (SELECT id FROM "MenuItem" ORDER BY id LIMIT 1)`, [
      `https://marea.example/api/media/${MEDIA_KEY}`,
    ]);

    const keygen = execFileSync("age-keygen", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    identity = /AGE-SECRET-KEY-[A-Z0-9]+/.exec(keygen)![0];
    recipient = /age1[a-z0-9]+/.exec(keygen)![0];

    const admin = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: adminKey!, secretAccessKey: adminSecret! } });
    await configureBackupBucket(admin, bucket);
    const write = await credentialsFor(writeOnlyPolicy(bucket));
    readerCredentials = await credentialsFor(readOnlyPolicy(bucket));

    backupConfig = readBackupConfig({
      BACKUP_DATABASE_URL: sourceUrl,
      BACKUP_AGE_RECIPIENT: recipient,
      BACKUP_S3_ENDPOINT: endpoint,
      BACKUP_S3_BUCKET: bucket,
      BACKUP_S3_ACCESS_KEY_ID: write.key,
      BACKUP_S3_SECRET_ACCESS_KEY: write.secret,
      BACKUP_S3_SESSION_TOKEN: write.token,
      BACKUP_MEDIA_DIR: mediaDir,
      BACKUP_APP_VERSION: "restore-test",
    });
    writer = s3ClientFor(backupConfig);
    // The slot is today's, so the backup is fresh for the age check.
    firstSlot = `${new Date().toISOString().slice(0, 10)}T06`;
    await createBackup(source, backupConfig, firstSlot, new Date(), writer);

    reader = {
      bucket,
      s3: new S3Client({
        endpoint,
        region: "us-east-1",
        forcePathStyle: true,
        credentials: { accessKeyId: readerCredentials.key, secretAccessKey: readerCredentials.secret, sessionToken: readerCredentials.token },
      }),
    };
  }, 180_000);

  afterAll(async () => {
    await source?.end();
    if (enabled) {
      const superClient = new pg.Client({ connectionString: adminDatabaseUrl });
      await superClient.connect();
      await superClient.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await superClient.end();
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it("restores the newest backup into a disposable database the application can read, and times it", async () => {
    const report = await runRestoreTest(readRestoreTestConfig(restoreEnv()));

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.backup).toMatchObject({ tier: "sixhourly", slot: firstSlot, appVersion: "restore-test" });
    expect(report.totalSeconds).toBeGreaterThan(0);
    expect(Object.keys(report.phaseSeconds)).toEqual(["find", "download", "decrypt", "database", "restore", "media", "verify"]);

    // Migrations: all applied, none pending, none half done.
    expect(report.verify.migrations).toMatchObject({ pending: [], unfinished: [], unknown: [] });
    expect(report.verify.migrations.applied).toBeGreaterThan(20);
    // Row level security: what the owner has, the application reads through its policies, business by business.
    const orders = report.verify.rls.find((t) => t.table === "Order");
    expect(orders?.ownerRows).toBeGreaterThan(0);
    expect(orders?.appRows).toBe(orders?.ownerRows);
    expect(report.verify.appRowsWithoutBusiness).toBe(0);
    expect(report.verify.roleProblem).toBeNull();
    expect(report.verify.media).toEqual({ referenced: 1, missing: [] });

    // The disposable database is gone afterwards, pass or fail.
    const left = execFileSync("docker", ["ps", "--all", "--quiet", "--filter", `label=${RESTORE_TEST_LABEL}`], { encoding: "utf8" });
    expect(left.trim()).toBe("");
  }, 240_000);

  it("fails, and says why, when the database points at a media file the archive does not have", async () => {
    await source.query(`UPDATE "MenuItem" SET "imageUrl" = 'https://marea.example/api/media/menu/gone.jpg' WHERE "imageUrl" LIKE '%${MEDIA_KEY}'`);
    const slot = `${new Date().toISOString().slice(0, 10)}T12`;
    // Taken three hours ago, against a one-hour limit: old by construction, not by a race with the clock.
    await createBackup(source, backupConfig, slot, new Date(Date.now() - 3 * 3_600_000), writer);

    const report = await runRestoreTest(readRestoreTestConfig({ ...restoreEnv(), RESTORE_MAX_BACKUP_AGE_HOURS: "1" }));

    expect(report.ok).toBe(false);
    expect(report.backup.slot).toBe(slot);
    expect(report.verify.media.missing).toEqual(["menu/gone.jpg"]);
    expect(report.problems.join("\n")).toMatch(/1 referenced media files are missing/);
    expect(report.problems.join("\n")).toMatch(/backups stopped running/);
  }, 240_000);

  it("uses an intact earlier version when the newest copy was overwritten, as a compromised server could", async () => {
    const slot = `${new Date().toISOString().slice(0, 10)}T18`;
    await createBackup(source, backupConfig, slot, new Date(), writer);
    await writer.send(new PutObjectCommand({ Bucket: bucket, Key: `sixhourly/${slot}/db.dump.age`, Body: "garbage, not the dump" }));

    const fetched = await fetchBackup(reader, "sixhourly", slot, join(workDir, "poisoned"));

    expect(fetched.manifest.slot).toBe(slot);
    expect(Object.keys(fetched.files)).toEqual(["db.dump.age", "media.tar.age"]);
    // The file on disk is the original, not the garbage.
    expect(readFileSync(fetched.files["db.dump.age"]).subarray(0, 21).toString()).toBe("age-encryption.org/v1");
  }, 60_000);

  it("refuses when there is no intact copy at all", async () => {
    const slot = `${new Date().toISOString().slice(0, 10)}T20`;
    const manifestKey = `sixhourly/${slot}/manifest.json`;
    await writer.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
        Body: JSON.stringify({ format: 1, files: [{ name: "db.dump.age", bytes: 1, sha256: "0".repeat(64) }] }),
      })
    );
    await writer.send(new PutObjectCommand({ Bucket: bucket, Key: `sixhourly/${slot}/db.dump.age`, Body: "x" }));

    await expect(fetchBackup(reader, "sixhourly", slot, join(workDir, "none"))).rejects.toThrow(/no intact copy/);
  }, 60_000);

  it("says so when a tier has no backup at all", async () => {
    await expect(findLatestSlot(reader, "monthly")).resolves.toBeNull();
    await expect(runRestoreTest(readRestoreTestConfig({ ...restoreEnv(), RESTORE_TIER: "monthly" }))).rejects.toThrow(/there is no backup in monthly/);
  }, 60_000);

  it("cannot be tricked into restoring over a database it did not start", async () => {
    await expect(assertDisposable(sourceUrl, "0123456789abcdef")).rejects.toThrow(/not started by this restore test/);
  });

  it("gives the restore credential no way to write or delete", async () => {
    const readOnly = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: readerCredentials.key, secretAccessKey: readerCredentials.secret, sessionToken: readerCredentials.token },
    });
    await expect(readOnly.send(new PutObjectCommand({ Bucket: bucket, Key: "sixhourly/x", Body: "x" }))).rejects.toMatchObject({ name: "AccessDenied" });
    // ...while it does read: that is its whole job.
    const manifest = await readOnly.send(new GetObjectCommand({ Bucket: bucket, Key: `sixhourly/${firstSlot}/manifest.json` }));
    expect(JSON.parse(await manifest.Body!.transformToString()).slot).toBe(firstSlot);
  });
});
