import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBackup, runBackup, s3ClientFor, type BackupManifest } from "./backup";
import { configureBackupBucket, writeOnlyPolicy } from "./backup-bucket";
import { readBackupConfig, type BackupConfig } from "./backup-config";
import { BACKUP_TIERS } from "./backup-policy";

// Runs the real thing: pg_dump 17, age, tar, and an object-locked S3 bucket
// (MinIO). Needs those tools on PATH, so it is skipped unless the variables below
// are set; the marea-ops image has the tools, and CI runs this file inside it
// (see the `ops` job). The point is what a mock would hide: that a write-only
// credential can actually complete a locked upload, and cannot do anything else.
const endpoint = process.env.OPS_TEST_S3_ENDPOINT;
const s3Admin = { key: process.env.OPS_TEST_S3_ADMIN_KEY, secret: process.env.OPS_TEST_S3_ADMIN_SECRET };
const adminDatabaseUrl = process.env.OPS_TEST_ADMIN_DATABASE_URL;
const enabled = Boolean(endpoint && s3Admin.key && s3Admin.secret && adminDatabaseUrl);

const id = Date.now().toString(36);
const database = `ops_backup_${id}`;
const bucket = `ops-test-${id}`;

describe.skipIf(!enabled)("backup against a real database and an object-locked store", () => {
  let admin: S3Client;
  let writer: S3Client;
  let client: pg.Client;
  let config: BackupConfig;
  let privateKeyFile: string;
  let workDir: string;
  let mediaDir: string;
  const slot = "2026-11-01T00"; // a Sunday and the first of a month: all four tiers

  function databaseUrl(name: string): string {
    const url = new URL(adminDatabaseUrl!);
    url.pathname = `/${name}`;
    return url.toString();
  }

  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), "ops-test-"));
    mediaDir = join(workDir, "media");
    mkdirSync(join(mediaDir, "menu"), { recursive: true });
    writeFileSync(join(mediaDir, "menu", "dish.jpg"), "not really a jpeg");

    const superClient = new pg.Client({ connectionString: adminDatabaseUrl });
    await superClient.connect();
    await superClient.query(`CREATE DATABASE "${database}"`);
    await superClient.end();
    const url = databaseUrl(database);
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: "ignore",
      shell: true,
    });
    client = new pg.Client({ connectionString: url });
    await client.connect();

    const keygen = execFileSync("age-keygen", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    privateKeyFile = join(workDir, "key.txt");
    writeFileSync(privateKeyFile, keygen);
    const recipient = /age1[a-z0-9]+/.exec(keygen)![0];

    admin = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: s3Admin.key!, secretAccessKey: s3Admin.secret! },
    });
    await configureBackupBucket(admin, bucket);

    // MinIO issues a temporary credential limited to the policy we would attach to
    // a provider's write-only key; nothing else about it differs.
    const sts = new STSClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: s3Admin.key!, secretAccessKey: s3Admin.secret! } });
    const { Credentials } = await sts.send(
      new AssumeRoleCommand({
        RoleArn: "arn:xxx:xxx:xxx:xxxx",
        RoleSessionName: "ops-test",
        Policy: JSON.stringify(writeOnlyPolicy(bucket)),
        DurationSeconds: 3600,
      })
    );
    config = readBackupConfig({
      BACKUP_DATABASE_URL: url,
      BACKUP_AGE_RECIPIENT: recipient,
      BACKUP_S3_ENDPOINT: endpoint,
      BACKUP_S3_BUCKET: bucket,
      BACKUP_S3_ACCESS_KEY_ID: Credentials!.AccessKeyId,
      BACKUP_S3_SECRET_ACCESS_KEY: Credentials!.SecretAccessKey,
      BACKUP_S3_SESSION_TOKEN: Credentials!.SessionToken,
      BACKUP_MEDIA_DIR: mediaDir,
      BACKUP_APP_VERSION: "test-1.2.3",
    });
    writer = s3ClientFor(config);
  }, 120_000);

  afterAll(async () => {
    await client?.end();
    if (enabled) {
      const superClient = new pg.Client({ connectionString: adminDatabaseUrl });
      await superClient.connect();
      await superClient.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await superClient.end();
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it("sets up the bucket with object lock and one expiry rule per tier", async () => {
    const lock = await admin.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
    expect(lock.ObjectLockConfiguration?.ObjectLockEnabled).toBe("Enabled");

    const lifecycle = await admin.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    expect(lifecycle.Rules?.map((r) => r.Filter?.Prefix).sort()).toEqual(BACKUP_TIERS.map((t) => `${t}/`).sort());

    await expect(configureBackupBucket(admin, bucket)).resolves.toBeUndefined();
  });

  it("uploads an encrypted database and media set to every tier, described by a manifest", async () => {
    await createBackup(client, config, slot, new Date(), writer);

    for (const tier of BACKUP_TIERS) {
      const manifestObject = await admin.send(new GetObjectCommand({ Bucket: bucket, Key: `${tier}/${slot}/manifest.json` }));
      const manifest = JSON.parse(await manifestObject.Body!.transformToString()) as BackupManifest;

      expect(manifest).toMatchObject({ format: 1, slot, appVersion: "test-1.2.3", tiers: [...BACKUP_TIERS] });
      expect(manifest.lastMigration).toMatch(/^\d{14}_/);
      expect(manifest.pgServerVersion).toMatch(/^17\./);
      expect(manifest.files.map((f) => f.name)).toEqual(["db.dump.age", "media.tar.age"]);

      for (const file of manifest.files) {
        const object = await admin.send(new GetObjectCommand({ Bucket: bucket, Key: `${tier}/${slot}/${file.name}` }));
        const bytes = Buffer.from(await object.Body!.transformToByteArray());
        expect(bytes.length).toBe(file.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
        expect(bytes.subarray(0, 21).toString()).toBe("age-encryption.org/v1");
      }
    }
  }, 120_000);

  it("produces files that only the private key opens, and that pg_restore and tar can read", async () => {
    const object = await admin.send(new GetObjectCommand({ Bucket: bucket, Key: `sixhourly/${slot}/db.dump.age` }));
    writeFileSync(join(workDir, "db.dump.age"), Buffer.from(await object.Body!.transformToByteArray()));
    execFileSync("age", ["--decrypt", "-i", privateKeyFile, "-o", join(workDir, "db.dump"), join(workDir, "db.dump.age")]);
    const toc = execFileSync("pg_restore", ["--list", join(workDir, "db.dump")], { encoding: "utf8" });
    expect(toc).toContain("TABLE public Business");
    expect(toc).toContain("POLICY public Business business_own");

    const media = await admin.send(new GetObjectCommand({ Bucket: bucket, Key: `sixhourly/${slot}/media.tar.age` }));
    writeFileSync(join(workDir, "media.tar.age"), Buffer.from(await media.Body!.transformToByteArray()));
    execFileSync("age", ["--decrypt", "-i", privateKeyFile, "-o", join(workDir, "media.tar"), join(workDir, "media.tar.age")]);
    expect(execFileSync("tar", ["-tf", join(workDir, "media.tar")], { encoding: "utf8" })).toContain("menu/dish.jpg");
    expect(readFileSync(privateKeyFile, "utf8")).toContain("AGE-SECRET-KEY-");
  });

  it("gives the server credential no way to read, list or delete", async () => {
    const key = `sixhourly/${slot}/db.dump.age`;
    await expect(writer.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(writer.send(new ListObjectsV2Command({ Bucket: bucket }))).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(writer.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))).rejects.toMatchObject({ name: "AccessDenied" });
  });

  it("keeps a locked copy even against the account owner", async () => {
    const versions = await admin.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: `monthly/${slot}/` }));
    const version = versions.Versions![0];

    await expect(
      admin.send(new DeleteObjectCommand({ Bucket: bucket, Key: version.Key, VersionId: version.VersionId }))
    ).rejects.toBeDefined();
    const after = await admin.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: `monthly/${slot}/` }));
    expect(after.Versions).toHaveLength(versions.Versions!.length);
  });

  it("does nothing the second time it is started in the same window", async () => {
    const now = new Date();
    expect(await runBackup(client, config, now)).toBe("succeeded");
    const before = await admin.send(new ListObjectVersionsCommand({ Bucket: bucket }));

    expect(await runBackup(client, config, now)).toBe("skipped-done");

    const after = await admin.send(new ListObjectVersionsCommand({ Bucket: bucket }));
    expect(after.Versions).toHaveLength(before.Versions!.length);
    const runs = await client.query(`SELECT status, processed FROM "OpsTaskRun" WHERE task = 'backup'`);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe("SUCCEEDED");
    expect(Number(runs.rows[0].processed)).toBeGreaterThan(0);
  }, 120_000);
});
