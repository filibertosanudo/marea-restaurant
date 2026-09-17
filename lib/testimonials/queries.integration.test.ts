import { describe, it, expect } from "vitest";
import { listTestimonialsByStatusRaw, listFeaturedTestimonialsRaw, getTestimonialByOrderId } from "./queries";
import { makeBusiness, makeTestimonial, makeOrder } from "@/test/factories";

describe("listFeaturedTestimonialsRaw", () => {
  it("only returns testimonials that are both APPROVED and featured", async () => {
    const business = await makeBusiness();
    await makeTestimonial(business.id, { authorName: "Pending Guest", status: "PENDING", isFeatured: true });
    await makeTestimonial(business.id, { authorName: "Rejected Guest", status: "REJECTED", isFeatured: true });
    await makeTestimonial(business.id, { authorName: "Approved Not Featured", status: "APPROVED", isFeatured: false });
    const featured = await makeTestimonial(business.id, {
      authorName: "Featured Guest",
      status: "APPROVED",
      isFeatured: true,
    });

    const result = await listFeaturedTestimonialsRaw(business.id);

    expect(result.map((t) => t.id)).toEqual([featured.id]);
  });

  it("orders by sortOrder ascending", async () => {
    const business = await makeBusiness();
    const second = await makeTestimonial(business.id, { status: "APPROVED", isFeatured: true, sortOrder: 1 });
    const first = await makeTestimonial(business.id, { status: "APPROVED", isFeatured: true, sortOrder: 0 });

    const result = await listFeaturedTestimonialsRaw(business.id);

    expect(result.map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it("excludes soft-deleted testimonials", async () => {
    const business = await makeBusiness();
    await makeTestimonial(business.id, { status: "APPROVED", isFeatured: true, deletedAt: new Date() });

    const result = await listFeaturedTestimonialsRaw(business.id);

    expect(result).toHaveLength(0);
  });
});

describe("listTestimonialsByStatusRaw", () => {
  it("scopes to the requested status only", async () => {
    const business = await makeBusiness();
    await makeTestimonial(business.id, { status: "PENDING" });
    await makeTestimonial(business.id, { status: "APPROVED" });

    const pending = await listTestimonialsByStatusRaw(business.id, "PENDING");

    expect(pending).toHaveLength(1);
  });
});

describe("getTestimonialByOrderId", () => {
  it("finds the review already left for an order", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });
    const testimonial = await makeTestimonial(business.id, { orderId: order.id });

    const result = await getTestimonialByOrderId(order.id);

    expect(result?.id).toBe(testimonial.id);
  });

  it("returns null when no review exists for the order", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { status: "DELIVERED" });

    const result = await getTestimonialByOrderId(order.id);

    expect(result).toBeNull();
  });
});
