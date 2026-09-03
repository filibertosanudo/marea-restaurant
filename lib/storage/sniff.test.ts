import { describe, expect, it } from "vitest";
import { sniffImageType } from "./sniff";

describe("sniffImageType", () => {
  it("identifies jpeg by its magic bytes", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
  });

  it("identifies png by its magic bytes", () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
  });

  it("identifies webp by its RIFF/WEBP magic bytes", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0, 0, 0, 0]), // chunk size, irrelevant here
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(sniffImageType(buf)).toBe("image/webp");
  });

  it("rejects a renamed non-image file regardless of its extension", () => {
    // The whole point: a .jpg that's actually an HTML/JS payload must not
    // pass just because someone named it right or set a matching header.
    expect(sniffImageType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });

  it("rejects a truncated buffer shorter than any signature", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("rejects a RIFF file that isn't WEBP (e.g. a WAV file)", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE", "ascii"),
    ]);
    expect(sniffImageType(buf)).toBeNull();
  });
});
