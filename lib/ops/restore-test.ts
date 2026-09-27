import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { BACKUP_TIERS } from "./backup-policy";
import { startDisposablePostgres } from "./disposable-postgres";
import { decrypt, fetchBackup, findLatestSlot, restoreDatabase, restoreMedia, type Reader } from "./restore";
import { verifyRestore, type VerifyReport } from "./restore-verify";

// Its own variable names, like the backup: nothing is read from .env and no
// database URL exists here at all (the target is one this run starts itself).
const schema = z
  .object({
    RESTORE_S3_ENDPOINT: z.string().url(),
    RESTORE_S3_BUCKET: z.string().min(1),
    RESTORE_S3_REGION: z.string().min(1).default("us-east-1"),
    /** Read-only credential (see readOnlyPolicy). Never the write key the server holds. */
    RESTORE_S3_ACCESS_KEY_ID: z.string().min(1),
    RESTORE_S3_SECRET_ACCESS_KEY: z.string().min(1),
    RESTORE_S3_SESSION_TOKEN: z.string().min(1).optional(),
    /** The age private key itself (a CI secret), or a path to a file holding it. */
    RESTORE_AGE_IDENTITY: z.string().min(1).optional(),
    RESTORE_AGE_IDENTITY_FILE: z.string().min(1).optional(),
    RESTORE_TIER: z.enum(BACKUP_TIERS).default("sixhourly"),
    /** A backup older than this means the backups stopped: the test fails on that too. Two six-hour windows plus slack. */
    RESTORE_MAX_BACKUP_AGE_HOURS: z.coerce.number().positive().default(13),
    RESTORE_PG_IMAGE: z.string().min(1).default("postgres:17-alpine"),
    RESTORE_MIGRATIONS_DIR: z.string().min(1).default("prisma/migrations"),
    RESTORE_MONITOR_URL: z.string().url().optional(),
  })
  .refine((v) => v.RESTORE_AGE_IDENTITY || v.RESTORE_AGE_IDENTITY_FILE, {
    message: "RESTORE_AGE_IDENTITY or RESTORE_AGE_IDENTITY_FILE is required",
  });

export type RestoreTestConfig = z.infer<typeof schema>;

export function readRestoreTestConfig(env: Record<string, string | undefined>): RestoreTestConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid restore test configuration:\n${details}`);
  }
  return parsed.data;
}

export type RestoreTestReport = {
  ok: boolean;
  startedAt: string;
  /** Start to finish: this is the recovery time the runbook quotes. */
  totalSeconds: number;
  phaseSeconds: Record<string, number>;
  backup: {
    tier: string;
    slot: string;
    createdAt: string;
    ageHours: number;
    appVersion: string;
    lastMigration: string | null;
    bytes: number;
  };
  verify: VerifyReport;
  problems: string[];
};

/**
 * Restores the newest backup into a database of its own and checks that what
 * came back is one the application can use. The measured time is the real
 * cost of a recovery on this path: download, decryption, restore, roles,
 * checks.
 */
export async function runRestoreTest(config: RestoreTestConfig): Promise<RestoreTestReport> {
  const started = Date.now();
  const phases: Record<string, number> = {};
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      phases[name] = Math.round((Date.now() - t) / 100) / 10;
    }
  };

  const workDir = await mkdtemp(join(tmpdir(), "marea-restore-test-"));
  let removeDatabase: (() => Promise<void>) | undefined;
  try {
    const identityFile = config.RESTORE_AGE_IDENTITY_FILE ?? join(workDir, "identity.txt");
    if (!config.RESTORE_AGE_IDENTITY_FILE) {
      await writeFile(identityFile, `${config.RESTORE_AGE_IDENTITY}\n`, { mode: 0o600 });
      await chmod(identityFile, 0o600);
    }

    const reader: Reader = {
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

    const slot = await timed("find", () => findLatestSlot(reader, config.RESTORE_TIER));
    if (!slot) throw new Error(`there is no backup in ${config.RESTORE_TIER}/: the backups are not running, or the bucket is wrong`);

    const fetched = await timed("download", () => fetchBackup(reader, config.RESTORE_TIER, slot, join(workDir, "download")));
    const { manifest } = fetched;
    const ageHours = (Date.now() - Date.parse(manifest.createdAt)) / 3_600_000;

    const dumpPath = join(workDir, "db.dump");
    await timed("decrypt", async () => {
      await decrypt(fetched.files["db.dump.age"], identityFile, dumpPath);
      if (fetched.files["media.tar.age"]) await decrypt(fetched.files["media.tar.age"], identityFile, join(workDir, "media.tar"));
    });

    const database = await timed("database", () => startDisposablePostgres({ image: config.RESTORE_PG_IMAGE, owner: manifest.owner }));
    removeDatabase = database.remove;

    const appPassword = randomBytes(18).toString("base64url");
    const workerPassword = randomBytes(18).toString("base64url");
    const urls = await timed("restore", () =>
      restoreDatabase({ adminUrl: database.adminUrl, database: "marea", appPassword, workerPassword }, dumpPath, manifest)
    );

    const mediaDir = fetched.files["media.tar.age"] ? join(workDir, "media") : undefined;
    if (mediaDir) await timed("media", () => restoreMedia(join(workDir, "media.tar"), mediaDir));

    const verify = await timed("verify", () =>
      verifyRestore({ ownerUrl: urls.ownerUrl, appUrl: urls.appUrl, migrationsDir: config.RESTORE_MIGRATIONS_DIR, mediaDir })
    );

    const problems = [...verify.problems];
    if (ageHours > config.RESTORE_MAX_BACKUP_AGE_HOURS) {
      problems.push(
        `the newest ${config.RESTORE_TIER} backup is ${ageHours.toFixed(1)} h old (limit ${config.RESTORE_MAX_BACKUP_AGE_HOURS} h): backups stopped running`
      );
    }

    return {
      ok: problems.length === 0,
      startedAt: new Date(started).toISOString(),
      totalSeconds: Math.round((Date.now() - started) / 100) / 10,
      phaseSeconds: phases,
      backup: {
        tier: config.RESTORE_TIER,
        slot,
        createdAt: manifest.createdAt,
        ageHours: Math.round(ageHours * 10) / 10,
        appVersion: manifest.appVersion,
        lastMigration: manifest.lastMigration,
        bytes: manifest.files.reduce((sum, f) => sum + f.bytes, 0),
      },
      verify,
      problems,
    };
  } finally {
    await removeDatabase?.();
    await rm(workDir, { recursive: true, force: true });
  }
}
