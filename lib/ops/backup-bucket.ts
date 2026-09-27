import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { BACKUP_TIERS, TIER_RETENTION_DAYS } from "./backup-policy";

/**
 * Prepares the bucket the backups go to. Run once, by a person, with an admin
 * credential that is never stored on the server: object lock can only be
 * switched on at creation on some providers, and the lifecycle rules are what
 * expire copies, so neither may be reachable from the machine being protected.
 *
 * Retention is the store's job. Each object is uploaded with a retain-until
 * date (the lock: nothing can delete it before then, whoever asks) and each
 * prefix has a lifecycle rule that removes it afterwards. No script deletes.
 */
export async function configureBackupBucket(admin: S3Client, bucket: string): Promise<void> {
  try {
    // Creating with object lock also turns versioning on, and cannot be undone.
    await admin.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
  } catch (err) {
    if (!(err instanceof BucketAlreadyOwnedByYou)) throw err;
  }
  await admin.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: BACKUP_TIERS.map((tier) => ({
          ID: `expire-${tier}`,
          Status: "Enabled" as const,
          Filter: { Prefix: `${tier}/` },
          // One day past the lock, so the rule never asks for something still locked.
          Expiration: { Days: TIER_RETENTION_DAYS[tier] + 1 },
          // Versioned bucket: expiring the current version leaves a delete marker
          // and a noncurrent version, which this removes once its lock is over.
          NoncurrentVersionExpiration: { NoncurrentDays: 1 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        })),
      },
    })
  );
}

/**
 * The only permissions the server's backup credential should have. PutObject
 * writes; PutObjectRetention is needed to set the lock at upload. No read, no
 * list, no delete, no bucket settings: a compromised server can add backups
 * and can neither see, change nor remove the ones already there.
 */
export function writeOnlyPolicy(bucket: string): object {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:PutObject", "s3:PutObjectRetention"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
}
