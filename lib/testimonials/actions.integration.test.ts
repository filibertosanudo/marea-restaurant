import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  approveTestimonialAction,
  rejectTestimonialAction,
  toggleFeaturedTestimonialAction,
  reorderTestimonialsAction,
} from "./actions";
import { makeBusiness, makeTestimonial, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

describe("approveTestimonialAction", () => {
  it("moves a pending testimonial to APPROVED", async () => {
    await loginAsAdmin();
    const business = await makeCurrentBusiness();
    const testimonial = await makeTestimonial(business.id, { status: "PENDING" });

    const result = await approveTestimonialAction(testimonial.id);

    expect(result).toEqual({ success: true });
    const updated = await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonial.id } });
    expect(updated.status).toBe("APPROVED");
  });

  it("reports not_found instead of throwing for a row that's already gone", async () => {
    // Same shape as two admins racing the same pending row: by the time the
    // second request's update runs, `where: { id, businessId }` no longer
    // matches anything.
    await loginAsAdmin();
    await makeCurrentBusiness();

    const result = await approveTestimonialAction("not-a-real-id");

    expect(result).toEqual({ error: "not_found" });
  });
});

describe("rejectTestimonialAction", () => {
  it("moves a pending testimonial to REJECTED without touching its words", async () => {
    await loginAsAdmin();
    const business = await makeCurrentBusiness();
    const testimonial = await makeTestimonial(business.id, {
      status: "PENDING",
      authorName: "Original Name",
    });

    await rejectTestimonialAction(testimonial.id);

    const updated = await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonial.id } });
    expect(updated.status).toBe("REJECTED");
    expect(updated.authorName).toBe("Original Name");
  });
});

describe("toggleFeaturedTestimonialAction", () => {
  it("flips isFeatured", async () => {
    await loginAsAdmin();
    const business = await makeCurrentBusiness();
    const testimonial = await makeTestimonial(business.id, { status: "APPROVED", isFeatured: false });

    await toggleFeaturedTestimonialAction(testimonial.id, true);

    const updated = await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonial.id } });
    expect(updated.isFeatured).toBe(true);
  });
});

describe("reorderTestimonialsAction", () => {
  it("sets sortOrder to match the given order", async () => {
    await loginAsAdmin();
    const business = await makeCurrentBusiness();
    const first = await makeTestimonial(business.id, { status: "APPROVED", sortOrder: 0 });
    const second = await makeTestimonial(business.id, { status: "APPROVED", sortOrder: 1 });

    await reorderTestimonialsAction([second.id, first.id]);

    const updatedFirst = await prisma.testimonial.findUniqueOrThrow({ where: { id: first.id } });
    const updatedSecond = await prisma.testimonial.findUniqueOrThrow({ where: { id: second.id } });
    expect(updatedSecond.sortOrder).toBe(0);
    expect(updatedFirst.sortOrder).toBe(1);
  });

  it("rolls back the whole batch and reports not_found when one id no longer matches", async () => {
    await loginAsAdmin();
    const business = await makeCurrentBusiness();
    const first = await makeTestimonial(business.id, { status: "APPROVED", sortOrder: 0 });

    const result = await reorderTestimonialsAction([first.id, "not-a-real-id"]);

    expect(result).toEqual({ error: "not_found" });
    const unchanged = await prisma.testimonial.findUniqueOrThrow({ where: { id: first.id } });
    expect(unchanged.sortOrder).toBe(0);
  });
});
