import "server-only";
import { env } from "@/lib/env";
import type { StorageDriver } from "@/lib/storage/driver";
import { createLocalDriver } from "@/lib/storage/drivers/local";
import { createS3Driver } from "@/lib/storage/drivers/s3";

let cached: StorageDriver | undefined;

function resolveDriver(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    // The S3_* fields are guaranteed present here — lib/env.ts's schema
    // requires them whenever STORAGE_DRIVER=s3, so an incomplete config
    // already failed at boot, never here mid-upload.
    return createS3Driver({
      endpoint: env.S3_ENDPOINT!,
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicHostname: env.MEDIA_HOSTNAME,
    });
  }
  return createLocalDriver(env.STORAGE_LOCAL_DIR);
}

/** Resolved once per process, lazily — first real use, same as lib/prisma's client, not at import. */
export function getStorageDriver(): StorageDriver {
  if (!cached) cached = resolveDriver();
  return cached;
}
