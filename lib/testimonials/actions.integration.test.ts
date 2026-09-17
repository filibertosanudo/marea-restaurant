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

    await approveTestimonialAction(testimonial.id);

    const updated = await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonial.id } });
    expect(updated.status).toBe("APPROVED");
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
});
