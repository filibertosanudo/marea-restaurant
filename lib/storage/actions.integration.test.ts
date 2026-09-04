import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadMenuItemImageAction } from "./actions";
import { makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

// A 1x1 transparent PNG — real magic bytes so sniffImageType and sharp both
// accept it as a genuine image, without needing a fixture file on disk.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const testMediaDir = mkdtempSync(path.join(tmpdir(), "marea-storage-test-"));
process.env.STORAGE_LOCAL_DIR = testMediaDir;

afterAll(() => {
  rmSync(testMediaDir, { recursive: true, force: true });
});

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function fileFormData(file: File | null) {
  const data = new FormData();
  if (file) data.set("file", file);
  return data;
}

describe("uploadMenuItemImageAction", () => {
  it("rejects a missing file", async () => {
    await loginAsAdmin();
    const result = await uploadMenuItemImageAction(undefined, fileFormData(null));
    expect(result).toEqual({ error: "no_file" });
  });

  it("rejects a file whose bytes don't match any known image format", async () => {
    await loginAsAdmin();
    const file = new File([Buffer.from("not an image")], "fake.png", { type: "image/png" });
    const result = await uploadMenuItemImageAction(undefined, fileFormData(file));
    expect(result).toEqual({ error: "unsupported_type" });
  });

  it("converts a real image to webp and stores it", async () => {
    await loginAsAdmin();
    const file = new File([ONE_PIXEL_PNG], "pixel.png", { type: "image/png" });
    const result = await uploadMenuItemImageAction(undefined, fileFormData(file));
    expect(result).toMatchObject({ success: true });
    expect((result as { url: string }).url).toMatch(/\.webp$/);
  });

  it("rejects a non-admin caller", async () => {
    const user = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(user));
    await expect(uploadMenuItemImageAction(undefined, fileFormData(null))).rejects.toThrow();
  });
});
