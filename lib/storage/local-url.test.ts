import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalDriver } from "./drivers/local";
import { isAllowedImageUrl } from "@/lib/env";
import { buildMenuItemSchema } from "@/lib/menu/schemas";

let tmpRoot: string;

beforeAll(async () => {
  // A realistic local dev .env (see .env.example): AUTH_URL set, https not
  // available. allowedImageHosts() derives from this.
  process.env.AUTH_URL ??= "http://localhost:3000";
  tmpRoot = await mkdtemp(path.join(tmpdir(), "marea-media-url-"));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("local driver URLs", () => {
  it("produces an absolute URL that passes isAllowedImageUrl and buildMenuItemSchema", async () => {
    // A relative "/api/media/..." URL — what this driver used to return —
    // fails z.string().url() outright, which would break every upload on
    // the default STORAGE_DRIVER=local config at save time.
    const driver = createLocalDriver(tmpRoot, "http://localhost:3000");
    const stored = await driver.put({
      body: Buffer.from("fake webp bytes"),
      contentType: "image/webp",
      key: "menu-items/regression-test.webp",
    });

    expect(stored.url).toBe("http://localhost:3000/api/media/menu-items/regression-test.webp");
    expect(isAllowedImageUrl(stored.url)).toBe(true);

    const result = buildMenuItemSchema("en").safeParse({
      categoryId: "cat1",
      basePrice: "10.00",
      compareAtPrice: "",
      imageUrl: stored.url,
      isAvailable: true,
      isFeatured: false,
      translations: { en: { name: "Test dish" }, es: {} },
      tagIds: [],
      modifierGroupIds: [],
    });
    expect(result.success).toBe(true);
  });
});
