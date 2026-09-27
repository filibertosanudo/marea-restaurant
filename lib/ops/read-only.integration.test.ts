import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertWritable, clearReadOnlyCache, isPlatformReadOnly, ReadOnlyModeError } from "./read-only";

async function setPlatformReadOnly(reason: string | null = null) {
  await prisma.readOnlyMode.create({ data: { scope: "PLATFORM", reason } });
  clearReadOnlyCache();
}

async function clearPlatformReadOnly() {
  await prisma.readOnlyMode.deleteMany({ where: { scope: "PLATFORM" } });
  clearReadOnlyCache();
}

describe("isPlatformReadOnly", () => {
  afterEach(clearPlatformReadOnly);

  it("is disabled when no row exists", async () => {
    expect(await isPlatformReadOnly()).toEqual({ enabled: false, reason: null });
  });

  it("is enabled once a platform row exists, and carries its reason", async () => {
    await setPlatformReadOnly("scheduled migration");
    expect(await isPlatformReadOnly()).toEqual({ enabled: true, reason: "scheduled migration" });
  });

  it("caches for a few seconds: a row created after the first read isn't seen until the cache is cleared", async () => {
    const t0 = 1_000_000;
    expect(await isPlatformReadOnly(t0)).toEqual({ enabled: false, reason: null });

    await prisma.readOnlyMode.create({ data: { scope: "PLATFORM" } });
    expect(await isPlatformReadOnly(t0 + 1_000)).toEqual({ enabled: false, reason: null }); // still cached

    expect(await isPlatformReadOnly(t0 + 6_000)).toEqual({ enabled: true, reason: null }); // past the TTL
  });

  it("only one row can ever exist for the platform scope", async () => {
    await prisma.readOnlyMode.create({ data: { scope: "PLATFORM" } });
    await expect(prisma.readOnlyMode.create({ data: { scope: "PLATFORM" } })).rejects.toThrow();
  });
});

describe("assertWritable", () => {
  afterEach(clearPlatformReadOnly);

  it("resolves when writable", async () => {
    await expect(assertWritable()).resolves.toBeUndefined();
  });

  it("throws ReadOnlyModeError, with the reason in the message, when not", async () => {
    await setPlatformReadOnly("about to run a risky migration");
    await expect(assertWritable()).rejects.toThrow(ReadOnlyModeError);
    await expect(assertWritable()).rejects.toThrow(/about to run a risky migration/);
  });

  it("gives a generic readable message when no reason was given", async () => {
    await setPlatformReadOnly();
    await expect(assertWritable()).rejects.toThrow(/maintenance/i);
  });
});
