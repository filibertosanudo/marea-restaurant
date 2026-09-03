"use server";

import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getStorageDriver } from "@/lib/storage";
import { sniffImageType } from "@/lib/storage/sniff";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;

export type UploadImageState = { success: true; url: string } | { error: string } | undefined;

export async function uploadMenuItemImageAction(
  _prevState: UploadImageState,
  formData: FormData
): Promise<UploadImageState> {
  await requireRole(...ADMIN_ROLES);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "no_file" };
  if (file.size > MAX_BYTES) return { error: "too_large" };

  const original = Buffer.from(await file.arrayBuffer());

  // By content, never by the client-supplied extension or Content-Type —
  // both are attacker-controlled fields that don't have to match the bytes.
  const detected = sniffImageType(original);
  if (!detected) return { error: "unsupported_type" };

  let processed: Buffer;
  try {
    processed = await sharp(original)
      // Bakes EXIF orientation into the pixels before it's dropped below —
      // otherwise a photo taken in portrait can end up sideways once its
      // orientation tag is gone.
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      // No .withMetadata(): sharp drops EXIF/ICC by default on output, which
      // is the point — it strips the phone's GPS tag along with everything
      // else, not just normalizes size and format.
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return { error: "invalid_image" };
  }

  const key = `menu-items/${createId()}.webp`;
  const stored = await getStorageDriver().put({ body: processed, contentType: "image/webp", key });

  return { success: true, url: stored.url };
}
