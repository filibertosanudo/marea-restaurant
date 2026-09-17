import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { submitTestimonialAction } from "./public-actions";
import { makeBusiness, makeOrder } from "@/test/factories";
import { runWithCookies } from "@/test/stubs/next-headers";

function makeCurrentBusiness(overrides: Parameters<typeof makeBusiness>[0] = {}) {
  return makeBusiness({ slug: "marea", ...overrides });
}

/** getOrderLang reads the guest-flow language cookie via next/headers' cookies() — routed through the same AsyncLocalStorage-backed stub the rest of the guest order flow's tests use (see test/stubs/next-headers.ts). */
function submit(publicToken: string, input: { rating: number; quote?: string }) {
  return runWithCookies({}, () => submitTestimonialAction(publicToken, input));
}

describe("submitTestimonialAction", () => {
  it("creates a testimonial frozen with the order's guest name", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED", guestName: "Sofia Ramirez" });

    const result = await submit(order.publicToken, { rating: 5, quote: "Loved it" });

    expect(result).toEqual({ ok: true });
    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(testimonial.authorName).toBe("Sofia Ramirez");
    expect(testimonial.rating).toBe(5);
    expect(testimonial.status).toBe("PENDING");
    const translation = await prisma.testimonialTranslation.findFirst({ where: { testimonialId: testimonial.id } });
    expect(translation?.quote).toBe("Loved it");
  });

  it("creates a testimonial with no translation row when the quote is left blank", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED", guestName: "Quiet Guest" });

    const result = await submit(order.publicToken, { rating: 4 });

    expect(result).toEqual({ ok: true });
    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    const translationCount = await prisma.testimonialTranslation.count({ where: { testimonialId: testimonial.id } });
    expect(translationCount).toBe(0);
  });

  it("falls back to Guest when the order has neither a guest name nor a linked customer", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });

    await submit(order.publicToken, { rating: 3 });

    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(testimonial.authorName).toBe("Guest");
  });

  it("rejects invalid input", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });

    const result = await submit(order.publicToken, { rating: 0 });

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("reports not_found for an unknown token", async () => {
    await makeCurrentBusiness();

    const result = await submit("not-a-real-token", { rating: 5 });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it.each(["PENDING", "PREPARING", "READY", "CANCELLED"] as const)(
    "refuses a review while the order is %s",
    async (status) => {
      const business = await makeCurrentBusiness();
      const order = await makeOrder(business.id, { status });

      const result = await submit(order.publicToken, { rating: 5 });

      expect(result).toEqual({ ok: false, error: "not_reviewable" });
      const count = await prisma.testimonial.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    }
  );

  it("refuses a second review for the same order", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });
    await submit(order.publicToken, { rating: 5 });

    const result = await submit(order.publicToken, { rating: 1, quote: "changed my mind" });

    expect(result).toEqual({ ok: false, error: "already_reviewed" });
    const count = await prisma.testimonial.count({ where: { orderId: order.id } });
    expect(count).toBe(1);
  });

  it("holds one review per order even under a concurrent double-submit", async () => {
    // The pre-check (getOrderForReviewByPublicToken) is the normal-path
    // guard; this is what actually proves the unique index on orderId is
    // load-bearing, not just documentation, when two requests land at once.
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });

    const [first, second] = await Promise.all([
      submit(order.publicToken, { rating: 5 }),
      submit(order.publicToken, { rating: 1 }),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "already_reviewed")).toHaveLength(1);
    const count = await prisma.testimonial.count({ where: { orderId: order.id } });
    expect(count).toBe(1);
  });

  it("reports rate_limited once this IP's submission attempts exceed the per-scope cap", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });
    await prisma.rateLimitCounter.createMany({
      data: Array.from({ length: 5 }, () => ({ scope: "testimonial:create", key: "unknown" })),
    });

    const result = await submit(order.publicToken, { rating: 5 });

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    const count = await prisma.testimonial.count({ where: { orderId: order.id } });
    expect(count).toBe(0);
  });
});
