import { getStorageDriver } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");

  const file = await getStorageDriver()
    .get(objectKey)
    .catch(() => null);
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
