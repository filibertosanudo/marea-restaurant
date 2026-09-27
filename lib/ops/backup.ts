import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type pg from "pg";
import { TIER_RETENTION_DAYS, backupSlot, tiersForSlot, type BackupTier } from "./backup-policy";
import type { BackupConfig } from "./backup-config";
import { run, runPiped } from "./exec";
import { pgEnvFromUrl } from "./pg-env";
import { runTask, type TaskOutcome } from "./task-run";

export const BACKUP_TASK = "backup";
export const MANIFEST_NAME = "manifest.json";

// One PutObject carries a file. Above this the store refuses it; multipart
// upload is the answer and it is not built until a deployment gets near it.
const SINGLE_PUT_LIMIT = 5 * 1024 ** 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BackupFile = { name: string; bytes: number; sha256: string };

export type BackupManifest = {
  format: 1;
  slot: string;
  createdAt: string;
  tiers: BackupTier[];
  appVersion: string;
  /** Last migration applied at dump time: which code a restore goes with. */
  lastMigration: string | null;
  pgServerVersion: string;
  pgDumpVersion: string;
  encryption: { tool: "age"; recipient: string };
  files: BackupFile[];
};

export function s3ClientFor(config: BackupConfig): S3Client {
  return new S3Client({
    endpoint: config.BACKUP_S3_ENDPOINT,
    region: config.BACKUP_S3_REGION,
    // Path-style and no default checksums: the two settings that make one client
    // work against MinIO, B2, R2, Wasabi and AWS alike (see lib/storage/drivers/s3.ts).
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: config.BACKUP_S3_SECRET_ACCESS_KEY,
      sessionToken: config.BACKUP_S3_SESSION_TOKEN,
    },
  });
}

/** The leading major number of a version string: "17.5" -> 17, "pg_dump (PostgreSQL) 17.5" -> 17. */
export function majorOf(version: string): number {
  const match = /(\d+)(?:\.\d+)*\s*$/.exec(version.trim()) ?? /(\d+)/.exec(version);
  if (!match) throw new Error(`cannot read a version from "${version}"`);
  return Number(match[1]);
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function describeFile(dir: string, name: string): Promise<BackupFile> {
  const path = join(dir, name);
  const { size } = await stat(path);
  if (size > SINGLE_PUT_LIMIT) throw new Error(`${name} is ${size} bytes: multipart upload is needed above 5 GiB`);
  return { name, bytes: size, sha256: await sha256Of(path) };
}

/**
 * Dumps as the owner, encrypts before anything leaves the machine, and uploads
 * one copy per tier the slot belongs to. The manifest goes last: a set without
 * one is an interrupted upload, never a backup.
 */
export async function createBackup(
  client: pg.Client,
  config: BackupConfig,
  slot: string,
  now: Date,
  s3: S3Client = s3ClientFor(config)
): Promise<{ processed: number; detail: string }> {
  const pgEnv = pgEnvFromUrl(config.BACKUP_DATABASE_URL);
  const workDir = await mkdtemp(join(tmpdir(), "marea-backup-"));
  try {
    const serverVersion = (await client.query<{ v: string }>("SELECT current_setting('server_version') AS v")).rows[0].v;
    const dumpVersion = (await run("pg_dump", ["--version"])).trim();
    // pg_dump refuses a newer server on its own, but says so late and obscurely;
    // this says it first.
    if (majorOf(dumpVersion) < majorOf(serverVersion)) {
      throw new Error(`${dumpVersion} is older than the server (${serverVersion}): a backup it produced could not be trusted`);
    }
    const migration = await client.query<{ migration_name: string }>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1"
    );

    // -Fc, the custom format: compressed, and pg_restore can list it, restore one
    // table, or run in parallel, none of which a plain SQL file allows.
    await run("pg_dump", ["--format=custom", "--no-password", "--file", join(workDir, "db.dump")], pgEnv);
    await run("age", ["--recipient", config.BACKUP_AGE_RECIPIENT, "--output", join(workDir, "db.dump.age"), join(workDir, "db.dump")]);
    await rm(join(workDir, "db.dump"));
    const names = ["db.dump.age"];

    if (config.BACKUP_MEDIA_DIR) {
      await runPiped(
        { command: "tar", args: ["-cf", "-", "-C", config.BACKUP_MEDIA_DIR, "."] },
        { command: "age", args: ["--recipient", config.BACKUP_AGE_RECIPIENT, "--output", join(workDir, "media.tar.age")] }
      );
      names.push("media.tar.age");
    }

    const files = await Promise.all(names.map((name) => describeFile(workDir, name)));
    const tiers = tiersForSlot(slot);
    const manifest: BackupManifest = {
      format: 1,
      slot,
      createdAt: now.toISOString(),
      tiers,
      appVersion: config.BACKUP_APP_VERSION,
      lastMigration: migration.rows[0]?.migration_name ?? null,
      pgServerVersion: serverVersion,
      pgDumpVersion: dumpVersion,
      encryption: { tool: "age", recipient: config.BACKUP_AGE_RECIPIENT },
      files,
    };

    for (const tier of tiers) {
      const retainUntil = new Date(now.getTime() + TIER_RETENTION_DAYS[tier] * DAY_MS);
      const lock = { ObjectLockMode: config.BACKUP_LOCK_MODE, ObjectLockRetainUntilDate: retainUntil } as const;
      for (const file of files) {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.BACKUP_S3_BUCKET,
            Key: `${tier}/${slot}/${file.name}`,
            Body: createReadStream(join(workDir, file.name)),
            ContentLength: file.bytes,
            ContentType: "application/octet-stream",
            ...lock,
          })
        );
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: config.BACKUP_S3_BUCKET,
          Key: `${tier}/${slot}/${MANIFEST_NAME}`,
          Body: JSON.stringify(manifest, null, 2),
          ContentType: "application/json",
          ...lock,
        })
      );
    }

    const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    return { processed: bytes, detail: `tiers=${tiers.join(",")} files=${files.map((f) => f.name).join(",")} bytes=${bytes}` };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** The scheduled entry point: one backup per six-hour window, however many times it is started. */
export async function runBackup(client: pg.Client, config: BackupConfig, now = new Date()): Promise<TaskOutcome> {
  const slot = backupSlot(now);
  return runTask(client, {
    task: BACKUP_TASK,
    slot,
    monitorUrl: config.BACKUP_MONITOR_URL,
    execute: () => createBackup(client, config, slot, now),
  });
}
