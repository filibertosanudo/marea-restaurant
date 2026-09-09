import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { unsubscribeAction, subscribeAction, confirmSubscriptionAction } from "./actions";
import { makeBusiness } from "@/test/factories";

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

describe("subscribeAction", () => {
  it("creates a subscriber and enqueues a confirmation email", async () => {
    await makeCurrentBusiness();

    const result = await subscribeAction("new@example.com", "en");

    expect(result).toEqual({ ok: true });
    const subscriber = await prisma.newsletterSubscriber.findFirstOrThrow({ where: { email: "new@example.com" } });
    expect(subscriber.confirmedAt).toBeNull();
    const job = await prisma.notificationJob.findFirst({ where: { recipientEmail: "new@example.com" } });
    expect(job?.templateKey).toBe("newsletter.confirm");
    expect(job?.payload).toMatchObject({ confirmUrl: expect.stringContaining(subscriber.unsubscribeToken) });
  });

  it("rejects an invalid email", async () => {
    await makeCurrentBusiness();

    const result = await subscribeAction("not-an-email", "en");

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("resubscribing an unsubscribed address clears unsubscribedAt and re-sends confirmation", async () => {
    const business = await makeCurrentBusiness();
    await prisma.newsletterSubscriber.create({
      data: { businessId: business.id, email: "back@example.com", unsubscribedAt: new Date() },
    });

    const result = await subscribeAction("back@example.com", "es");

    expect(result).toEqual({ ok: true });
    const subscriber = await prisma.newsletterSubscriber.findFirstOrThrow({ where: { email: "back@example.com" } });
    expect(subscriber.unsubscribedAt).toBeNull();
  });

  it("does not re-send a confirmation to an already-confirmed, still-subscribed address", async () => {
    const business = await makeCurrentBusiness();
    await prisma.newsletterSubscriber.create({
      data: { businessId: business.id, email: "already@example.com", confirmedAt: new Date() },
    });

    await subscribeAction("already@example.com", "en");

    const jobCount = await prisma.notificationJob.count({ where: { recipientEmail: "already@example.com" } });
    expect(jobCount).toBe(0);
  });

  it("requires a fresh confirmation to reactivate a previously confirmed, now-unsubscribed address", async () => {
    // The double opt-in gate must hold even on re-subscribe: an address
    // that confirmed once and later unsubscribed must not become active
    // again just because someone (not necessarily the owner) re-submits
    // it on the public form — see the confirmedAt reset below.
    const business = await makeCurrentBusiness();
    const original = await prisma.newsletterSubscriber.create({
      data: {
        businessId: business.id,
        email: "wasconfirmed@example.com",
        confirmedAt: new Date("2026-01-01"),
        unsubscribedAt: new Date("2026-02-01"),
      },
    });

    const result = await subscribeAction("wasconfirmed@example.com", "en");

    expect(result).toEqual({ ok: true });
    const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: original.id } });
    expect(subscriber.unsubscribedAt).toBeNull();
    expect(subscriber.confirmedAt).toBeNull();
    const job = await prisma.notificationJob.findFirst({ where: { recipientEmail: "wasconfirmed@example.com" } });
    expect(job?.templateKey).toBe("newsletter.confirm");
  });

  it("lets the same address go through the confirm/unsubscribe/resubscribe cycle twice", async () => {
    // Regression check for the dedupeKey: it must not collide across two
    // separate confirmation cycles for the same subscriber row.
    const business = await makeCurrentBusiness();
    await subscribeAction("cycle@example.com", "en");
    const first = await prisma.newsletterSubscriber.findFirstOrThrow({ where: { businessId: business.id, email: "cycle@example.com" } });
    await confirmSubscriptionAction(first.unsubscribeToken);
    await unsubscribeAction(first.unsubscribeToken);

    const result = await subscribeAction("cycle@example.com", "en");

    expect(result).toEqual({ ok: true });
    const jobCount = await prisma.notificationJob.count({ where: { recipientEmail: "cycle@example.com" } });
    expect(jobCount).toBe(2);
  });
});

describe("confirmSubscriptionAction", () => {
  it("stamps confirmedAt for a valid token", async () => {
    const business = await makeBusiness();
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { businessId: business.id, email: "confirm@example.com" },
    });

    const result = await confirmSubscriptionAction(subscriber.unsubscribeToken);

    expect(result).toEqual({ ok: true });
    const updated = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(updated.confirmedAt).not.toBeNull();
  });

  it("reports not_found for an unknown token", async () => {
    const result = await confirmSubscriptionAction("not-a-real-token");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

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
