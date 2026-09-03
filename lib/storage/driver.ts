import "server-only";

export type StoredFile = { url: string; key: string };

export interface StorageDriver {
  put(input: { body: Buffer; contentType: string; key: string }): Promise<StoredFile>;
  /** Null if the key doesn't exist. Only the local driver's own route handler (app/api/media) calls this — an s3-backed deployment serves images straight from the bucket/CDN instead. */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL for a key already stored — doesn't check that it exists. */
  publicUrl(key: string): string;
  /** Reverses publicUrl(): the key a URL points at if it's one this driver could have issued, else null — tells apart our own storage from a URL an admin pasted pointing somewhere else entirely. */
  keyFromUrl(url: string): string | null;
  /** Every key currently stored under `prefix`, for sweeping orphans a failed post-upload step left behind. */
  list(prefix: string): Promise<string[]>;
}
