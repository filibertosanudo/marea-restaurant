import { getStorageDriver } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");

  const file = await getStorageDriver()
    .get(objectKey)
    .catch((err) => {
      // A missing key returns null, not a rejection (see the driver's own
      // get()) — anything that reaches this catch is a real storage-layer
      // failure (disk permissions, a rejected traversal attempt), not a
      // routine 404, and would otherwise degrade to "not found" with zero
      // trace of what actually happened.
      console.error(`Failed to serve media key "${objectKey}":`, err);
      return null;
    });
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      // Filenames are content-addressed (menu-items/<cuid2>.webp): a URL
      // never gets reused for different bytes, so a permanent, immutable
      // cache is always correct.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
