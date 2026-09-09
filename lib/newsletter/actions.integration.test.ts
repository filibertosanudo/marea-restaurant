import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { unsubscribeAction } from "./actions";
import { makeBusiness } from "@/test/factories";

describe("unsubscribeAction", () => {
  it("stamps unsubscribedAt for a valid token", async () => {
    const business = await makeBusiness();
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { businessId: business.id, email: "guest@example.com" },
    });

    const result = await unsubscribeAction(subscriber.unsubscribeToken);

    expect(result).toEqual({ ok: true });
    const updated = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(updated.unsubscribedAt).not.toBeNull();
  });

  it("is idempotent for an already-unsubscribed token", async () => {
    const business = await makeBusiness();
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { businessId: business.id, email: "guest2@example.com", unsubscribedAt: new Date("2026-01-01") },
    });

    const result = await unsubscribeAction(subscriber.unsubscribeToken);

    expect(result).toEqual({ ok: true });
    const unchanged = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(unchanged.unsubscribedAt).toEqual(new Date("2026-01-01"));
  });

  it("reports not_found for an unknown token", async () => {
    const result = await unsubscribeAction("not-a-real-token");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
