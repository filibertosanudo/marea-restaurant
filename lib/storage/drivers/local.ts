import "server-only";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver, StoredFile } from "@/lib/storage/driver";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/** Rejects anything that could escape `dir` via `..` or an absolute path — every key this app generates is a plain `prefix/cuid2.ext`, so this only ever fires on a malformed request. */
function safeJoin(dir: string, key: string): string {
  const resolved = path.resolve(dir, key);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    throw new Error(`Refusing to resolve storage key outside its root: ${key}`);
  }
  return resolved;
}

async function walk(dir: string, base: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(base, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
}

export function createLocalDriver(rootDir: string, origin: string): StorageDriver {
  const root = path.resolve(rootDir);
  // Absolute, not "/api/media/<key>" — the URL is stored as MenuItem.imageUrl
  // and re-validated by buildMenuItemSchema's isAllowedImageUrl on every
  // save, which requires a well-formed absolute URL (z.string().url()
  // rejects a bare path outright).
  const baseUrl = `${origin.replace(/\/$/, "")}/api/media/`;

  return {
    async put({ body, key }): Promise<StoredFile> {
      const filePath = safeJoin(root, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      return { url: this.publicUrl(key), key };
    },

    async get(key: string) {
      const filePath = safeJoin(root, key);
      try {
        const body = await readFile(filePath);
        const contentType = CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
        return { body, contentType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      const filePath = safeJoin(root, key);
      try {
        await rm(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },

    publicUrl(key: string): string {
      return `${baseUrl}${key}`;
    },

    keyFromUrl(url: string): string | null {
      return url.startsWith(baseUrl) ? url.slice(baseUrl.length) : null;
    },

    async list(prefix: string): Promise<string[]> {
      const dir = safeJoin(root, prefix);
      if (!(await stat(dir).catch(() => null))?.isDirectory()) return [];
      const keys = await walk(dir, root);
      return keys;
    },
  };
}
