import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  type ObjectVersion,
  type S3Client,
} from "@aws-sdk/client-s3";
import pg from "pg";
import { MANIFEST_NAME, type BackupManifest } from "./backup";
import type { BackupTier } from "./backup-policy";
import { run } from "./exec";
import { pgEnvFromUrl } from "./pg-env";

export type Reader = { s3: S3Client; bucket: string };

/** The newest slot in a tier that has a manifest, or null when the tier is empty. */
export async function findLatestSlot(reader: Reader, tier: BackupTier): Promise<string | null> {
  const slots = new Set<string>();
  let token: string | undefined;
  do {
    const page = await reader.s3.send(
      new ListObjectsV2Command({ Bucket: reader.bucket, Prefix: `${tier}/`, ContinuationToken: token })
    );
    for (const object of page.Contents ?? []) {
      const [, slot, name] = (object.Key ?? "").split("/");
      if (name === MANIFEST_NAME && slot) slots.add(slot);
    }
    token = page.NextContinuationToken;
  } while (token);
  return [...slots].sort().at(-1) ?? null;
}

async function versionsUnder(reader: Reader, prefix: string): Promise<Map<string, ObjectVersion[]>> {
  const byKey = new Map<string, ObjectVersion[]>();
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  do {
    const page = await reader.s3.send(
      new ListObjectVersionsCommand({ Bucket: reader.bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker })
    );
    for (const version of page.Versions ?? []) {
      if (!version.Key) continue;
      byKey.set(version.Key, [...(byKey.get(version.Key) ?? []), version]);
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);
  for (const list of byKey.values()) list.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  return byKey;
}

async function download(reader: Reader, key: string, versionId: string | undefined, dest: string): Promise<string> {
  const object = await reader.s3.send(new GetObjectCommand({ Bucket: reader.bucket, Key: key, VersionId: versionId }));
  const hash = createHash("sha256");
  const body = object.Body as Readable;
  body.on("data", (chunk: Buffer) => hash.update(chunk));
  await pipeline(body, createWriteStream(dest));
  return hash.digest("hex");
}

export type FetchedBackup = { manifest: BackupManifest; tier: BackupTier; files: Record<string, string> };

/**
 * Downloads a backup set and proves each file is the one its manifest names.
 *
 * The write-only key can overwrite an object (S3 cannot deny that: versioning
 * and the lock keep the earlier version, but the newest one wins a plain read),
 * so the newest version is not trusted. Each manifest version, newest first, is
 * accepted only if every file it lists exists as some version whose sha256
 * matches. A poisoned newest copy is skipped and the earlier, intact one is used.
 */
export async function fetchBackup(reader: Reader, tier: BackupTier, slot: string, workDir: string): Promise<FetchedBackup> {
  await mkdir(workDir, { recursive: true });
  const versions = await versionsUnder(reader, `${tier}/${slot}/`);
  const manifestVersions = versions.get(`${tier}/${slot}/${MANIFEST_NAME}`) ?? [];
  if (manifestVersions.length === 0) throw new Error(`${tier}/${slot} has no manifest`);

  const problems: string[] = [];
  for (const manifestVersion of manifestVersions) {
    let manifest: BackupManifest;
    try {
      const path = join(workDir, "manifest.candidate.json");
      await download(reader, manifestVersion.Key!, manifestVersion.VersionId, path);
      manifest = JSON.parse(await readFile(path, "utf8")) as BackupManifest;
      if (manifest.format !== 1 || !Array.isArray(manifest.files)) throw new Error("not a format 1 manifest");
    } catch (err) {
      problems.push(`manifest ${manifestVersion.VersionId}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const files: Record<string, string> = {};
    let complete = true;
    for (const file of manifest.files) {
      const key = `${tier}/${slot}/${file.name}`;
      const dest = join(workDir, file.name);
      let matched = false;
      for (const version of versions.get(key) ?? []) {
        const sha256 = await download(reader, key, version.VersionId, dest);
        if (sha256 === file.sha256) {
          matched = true;
          break;
        }
        problems.push(`${key} ${version.VersionId}: sha256 differs from the manifest`);
      }
      if (!matched) {
        complete = false;
        break;
      }
      files[file.name] = dest;
    }
    if (complete) return { manifest, tier, files };
  }
  throw new Error(`no intact copy of ${tier}/${slot}:\n  ${problems.join("\n  ")}`);
}

/** Decrypts with an age identity file (the private key), which never lives on the server that makes backups. */
export async function decrypt(encryptedPath: string, identityFile: string, outputPath: string): Promise<void> {
  await run("age", ["--decrypt", "--identity", identityFile, "--output", outputPath, encryptedPath]);
}

const ROLE_DDL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marea_app') THEN
    CREATE ROLE marea_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marea_worker') THEN
    CREATE ROLE marea_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$`;

export type RestoreTarget = {
  /** A connection to the target cluster as the owner role (the manifest's `owner`), to the maintenance database. */
  adminUrl: string;
  database: string;
  appPassword: string;
  workerPassword: string;
};

/**
 * Restores into an empty cluster in the order the restore must follow, which
 * was measured, not assumed: the cluster roles first (a dump carries the GRANTs
 * and policies that name marea_app and marea_worker but not the roles, and
 * without them the restore fails with 147 errors and leaves a database the
 * application cannot use), then the data as the owner, then a login for each
 * role. Returns the URLs of the restored database for each of the three.
 */
export async function restoreDatabase(target: RestoreTarget, dumpPath: string, manifest: BackupManifest) {
  const admin = new pg.Client({ connectionString: target.adminUrl });
  await admin.connect();
  try {
    const who = (await admin.query<{ u: string }>("SELECT current_user AS u")).rows[0].u;
    if (who !== manifest.owner) {
      throw new Error(`the target connection is "${who}" but the backup's objects belong to "${manifest.owner}": connect as a role with that name`);
    }
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [target.database]);
    if (existing.rowCount) throw new Error(`database "${target.database}" already exists: a restore only goes into an empty cluster`);

    await admin.query(ROLE_DDL);
    await admin.query(`CREATE DATABASE "${target.database.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(target.adminUrl);
  url.pathname = `/${target.database}`;
  // --exit-on-error: a restore that ignores its errors is how a database ends up
  // half there. --single-transaction: all of it or nothing.
  await run("pg_restore", ["--no-password", "--exit-on-error", "--single-transaction", "--dbname", target.database, dumpPath], pgEnvFromUrl(url.toString()));

  const provision = new pg.Client({ connectionString: target.adminUrl });
  await provision.connect();
  try {
    for (const [role, password] of [
      ["marea_app", target.appPassword],
      ["marea_worker", target.workerPassword],
    ] as const) {
      await provision.query("SELECT set_config('marea.pw', $1, false)", [password]);
      await provision.query(`DO $$ BEGIN EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', '${role}', current_setting('marea.pw')); END $$`);
    }
  } finally {
    await provision.end();
  }

  const as = (user: string, password: string) => {
    const u = new URL(url.toString());
    u.username = user;
    u.password = password;
    return u.toString();
  };
  return {
    ownerUrl: url.toString(),
    appUrl: as("marea_app", target.appPassword),
    workerUrl: as("marea_worker", target.workerPassword),
  };
}

/** Unpacks the media archive into `dir`, which must not hold anything yet. */
export async function restoreMedia(tarPath: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await run("tar", ["-xf", tarPath, "-C", dir]);
}
