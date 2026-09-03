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
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const keys: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      keys.push(...(await walk(full, base)));
    } else {
      keys.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return keys;
}

export function createLocalDriver(rootDir: string): StorageDriver {
  const root = path.resolve(rootDir);

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
      return `/api/media/${key}`;
    },

    keyFromUrl(url: string): string | null {
      const prefix = "/api/media/";
      return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    },

    async list(prefix: string): Promise<string[]> {
      const dir = safeJoin(root, prefix);
      if (!(await stat(dir).catch(() => null))?.isDirectory()) return [];
      const keys = await walk(dir, root);
      return keys;
    },
  };
}
