/**
 * One-time bucket setup, run by hand from a workstation with an ADMIN
 * credential for the backup account. That credential is never written to the
 * server's environment. Prints the policy to attach to the server's
 * write-only key.
 *
 *   BACKUP_ADMIN_S3_ENDPOINT=... BACKUP_ADMIN_S3_ACCESS_KEY_ID=... \
 *   BACKUP_ADMIN_S3_SECRET_ACCESS_KEY=... BACKUP_ADMIN_S3_BUCKET=... \
 *   npm run ops:backup-bucket
 */
import { S3Client } from "@aws-sdk/client-s3";
import { configureBackupBucket, writeOnlyPolicy } from "../../lib/ops/backup-bucket";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const bucket = required("BACKUP_ADMIN_S3_BUCKET");
  const admin = new S3Client({
    endpoint: required("BACKUP_ADMIN_S3_ENDPOINT"),
    region: process.env.BACKUP_ADMIN_S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("BACKUP_ADMIN_S3_ACCESS_KEY_ID"),
      secretAccessKey: required("BACKUP_ADMIN_S3_SECRET_ACCESS_KEY"),
    },
  });
  await configureBackupBucket(admin, bucket);
  console.log(`Bucket "${bucket}" is ready: object lock on, lifecycle rules set.`);
  console.log("Attach this policy to the server's write-only key (nothing else):");
  console.log(JSON.stringify(writeOnlyPolicy(bucket), null, 2));
}

main().catch((err) => {
  console.error(`[ops:backup-bucket] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
