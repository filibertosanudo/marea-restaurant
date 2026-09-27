import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { purgeRateLimits } from "./purge-rate-limits";

const now = new Date("2027-01-01T00:00:00Z");
const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000);

describe("purgeRateLimits", () => {
  it("only touches rows past the 24-hour margin", async () => {
    await prisma.rateLimitCounter.createMany({
      data: [
        { scope: "reservation:create", key: "1.1.1.1", createdAt: old },
        { scope: "reservation:create", key: "2.2.2.2", createdAt: recent },
      ],
    });

    const dryRun = await purgeRateLimits(now, true);
    expect(dryRun.count).toBe(1);
    expect(await prisma.rateLimitCounter.count()).toBe(2);

    const real = await purgeRateLimits(now, false);
    expect(real.count).toBe(1);
    expect(await prisma.rateLimitCounter.findMany({ select: { key: true } })).toEqual([{ key: "2.2.2.2" }]);
  });
});
