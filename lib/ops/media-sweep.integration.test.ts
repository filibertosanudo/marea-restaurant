import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { makeBusiness, makeMenuCategory, makeMenuItem } from "@/test/factories";
import { sweepOrphanedMedia } from "./media-sweep";

const mediaDir = mkdtempSync(join(tmpdir(), "marea-media-sweep-"));
process.env.STORAGE_LOCAL_DIR = mediaDir;

afterAll(() => rmSync(mediaDir, { recursive: true, force: true }));

function put(key: string) {
  const dir = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  mkdirSync(join(mediaDir, dir), { recursive: true });
  writeFileSync(join(mediaDir, key), "not really a jpeg");
}

describe("sweepOrphanedMedia", () => {
  it("finds a key no MenuItem references, and leaves a referenced one alone", async () => {
    const { getStorageDriver: driverFor } = await import("@/lib/storage");
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    await makeMenuItem(business.id, category.id, { imageUrl: driverFor().publicUrl("menu-items/kept.jpg") });
    put("menu-items/kept.jpg");
    put("menu-items/orphan.jpg");

    const dryRun = await sweepOrphanedMedia(true);
    expect(dryRun.orphaned).toEqual(["menu-items/orphan.jpg"]);

    const { getStorageDriver } = await import("@/lib/storage");
    expect(await getStorageDriver().get("menu-items/orphan.jpg")).not.toBeNull();

    const real = await sweepOrphanedMedia(false);
    expect(real.orphaned).toEqual(["menu-items/orphan.jpg"]);
    expect(await getStorageDriver().get("menu-items/orphan.jpg")).toBeNull();
    expect(await getStorageDriver().get("menu-items/kept.jpg")).not.toBeNull();
  });

  it("sees no business as no references, not as nothing to protect", async () => {
    // No MenuItem at all in this schema when this test runs alone, so a
    // fresh key must be reported orphaned, never silently kept.
    put("menu-items/lonely.jpg");
    const result = await sweepOrphanedMedia(true);
    expect(result.orphaned).toContain("menu-items/lonely.jpg");
  });
});
