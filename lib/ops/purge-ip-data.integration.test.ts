import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { purgeOldIpData } from "./purge-ip-data";

const now = new Date("2027-01-01T00:00:00Z");
const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
const recent = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);

async function seed() {
  await prisma.loginAttempt.createMany({
    data: [
      { email: "a@example.com", ipAddress: "1.1.1.1", createdAt: old },
      { email: "b@example.com", ipAddress: "2.2.2.2", createdAt: recent },
    ],
  });
  await prisma.rateLimitCounter.createMany({
    data: [
      { scope: "s", key: "k1", createdAt: old },
      { scope: "s", key: "k2", createdAt: recent },
    ],
  });
}

describe("purgeOldIpData", () => {
  it("counts without deleting when dryRun is true", async () => {
    await seed();
    const result = await purgeOldIpData(now, true);

    expect(result).toMatchObject({ loginAttempts: 1, rateLimitCounters: 1 });
    expect(await prisma.loginAttempt.count()).toBe(2);
    expect(await prisma.rateLimitCounter.count()).toBe(2);
  });

  it("deletes only rows past the 90-day cutoff", async () => {
    await seed();
    const result = await purgeOldIpData(now, false);

    expect(result).toMatchObject({ loginAttempts: 1, rateLimitCounters: 1 });
    expect(await prisma.loginAttempt.findMany({ select: { email: true } })).toEqual([{ email: "b@example.com" }]);
    expect(await prisma.rateLimitCounter.findMany({ select: { key: true } })).toEqual([{ key: "k2" }]);
  });
});
