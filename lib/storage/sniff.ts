const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function matches(buffer: Buffer, signature: number[], offset: number): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, i) => buffer[offset + i] === byte);
}

/** Identifies an image by its magic bytes, never by file extension or the client-supplied Content-Type — both are attacker-controlled. */
export function sniffImageType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (matches(buffer, JPEG, 0)) return "image/jpeg";
  if (matches(buffer, PNG, 0)) return "image/png";
  if (matches(buffer, RIFF, 0) && matches(buffer, WEBP, 8)) return "image/webp";
  return null;
}
