import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageDriver, StoredFile } from "@/lib/storage/driver";
import { Readable } from "node:stream";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

type S3Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** CDN or custom domain in front of the bucket; falls back to endpoint/bucket path-style otherwise. */
  publicHostname?: string;
};

export function createS3Driver(config: S3Config): StorageDriver {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Path-style (endpoint/bucket/key) rather than virtual-hosted-style
    // (bucket.endpoint/key) is what makes the same client code work
    // unmodified against MinIO, R2, B2, Hetzner, and AWS — the one thing
    // that makes S3_ENDPOINT alone enough to switch providers.
    forcePathStyle: true,
  });

  function publicUrl(key: string): string {
    if (config.publicHostname) return `https://${config.publicHostname}/${key}`;
    return `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${key}`;
  }

  function keyFromUrl(url: string): string | null {
    const prefix = config.publicHostname
      ? `https://${config.publicHostname}/`
      : `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }

  return {
    async put({ body, contentType, key }): Promise<StoredFile> {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return { url: publicUrl(key), key };
    },

    async get(key: string) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const body = await streamToBuffer(result.Body as Readable);
        return { body, contentType: result.ContentType ?? "application/octet-stream" };
      } catch (err) {
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },

    publicUrl,
    keyFromUrl,

    async list(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );
        for (const obj of result.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
  };
}
