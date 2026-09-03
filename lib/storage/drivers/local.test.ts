import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalDriver } from "./local";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(tmpdir(), "marea-local-driver-"));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("local storage driver", () => {
  it("round-trips put/get/list/keyFromUrl/delete", async () => {
    const driver = createLocalDriver(tmpRoot, "https://marea.example.com");
    const key = "menu-items/one.webp";

    const stored = await driver.put({ body: Buffer.from("hello"), contentType: "image/webp", key });
    expect(stored.url).toBe("https://marea.example.com/api/media/menu-items/one.webp");

    const fetched = await driver.get(key);
    expect(fetched?.body.toString()).toBe("hello");
    expect(fetched?.contentType).toBe("image/webp");

    expect(await driver.list("menu-items/")).toEqual([key]);
    expect(driver.keyFromUrl(stored.url)).toBe(key);
    expect(driver.keyFromUrl("https://elsewhere.example.com/x.webp")).toBeNull();

    await driver.delete(key);
    expect(await driver.get(key)).toBeNull();
    expect(await driver.list("menu-items/")).toEqual([]);
  });

  it("lists files nested under subdirectories", async () => {
    const driver = createLocalDriver(tmpRoot, "https://marea.example.com");
    await driver.put({ body: Buffer.from("a"), contentType: "image/webp", key: "menu-items/a.webp" });
    await driver.put({ body: Buffer.from("b"), contentType: "image/webp", key: "menu-items/sub/b.webp" });

    const keys = await driver.list("menu-items/");
    expect(keys.sort()).toEqual(["menu-items/a.webp", "menu-items/sub/b.webp"]);

    await driver.delete("menu-items/a.webp");
    await driver.delete("menu-items/sub/b.webp");
  });

  it("rejects a path-traversal key on put, get, and delete", async () => {
    const driver = createLocalDriver(tmpRoot, "https://marea.example.com");
    await expect(
      driver.put({ body: Buffer.from("x"), contentType: "image/webp", key: "../outside.webp" })
    ).rejects.toThrow();
    await expect(driver.get("../outside.webp")).rejects.toThrow();
    await expect(driver.delete("../outside.webp")).rejects.toThrow();
  });

  it("returns null, not a throw, for a missing key", async () => {
    const driver = createLocalDriver(tmpRoot, "https://marea.example.com");
    expect(await driver.get("menu-items/does-not-exist.webp")).toBeNull();
  });
});
