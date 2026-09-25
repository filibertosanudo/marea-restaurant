import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPublicBusiness } from "@/lib/business";
import { getPublicMenuByLang } from "@/lib/menu/queries";
import { listFeaturedPromotionsForLanding } from "@/lib/promotions/queries";
import { listFeaturedTestimonialsForLanding } from "@/lib/testimonials/queries";
import { getPublicOpeningHours } from "@/lib/reservations/queries";
import { toggleAvailabilityAction } from "@/lib/menu/item-actions";
import { toggleCategoryActiveAction } from "@/lib/menu/category-actions";
import { toggleActivePromotionAction } from "@/lib/promotions/actions";
import { approveTestimonialAction } from "@/lib/testimonials/actions";
import { updateOpeningHoursAction, updateBusinessSettingsAction } from "@/lib/settings/actions";
import {
  makeBusiness,
  makeMenuCategory,
  makeMenuItem,
  makePromotion,
  makeTestimonial,
  makeStaff,
} from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

const updateTagMock = vi.mocked(updateTag);

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

beforeEach(() => {
  updateTagMock.mockClear();
});

describe("cached reads keep their types", () => {
  it("getPublicBusiness returns Decimal and Date columns as Decimal and Date, equal to the row", async () => {
    const row = await makeBusiness({
      slug: "marea",
      taxRate: "0.1600",
      latitude: "29.075000",
      longitude: "-110.955000",
      addressLine1: "Calle 1",
    });

    const business = await getPublicBusiness();

    expect(business.taxRate).toBeInstanceOf(Prisma.Decimal);
    expect(business.latitude).toBeInstanceOf(Prisma.Decimal);
    expect(business.createdAt).toBeInstanceOf(Date);
    expect(business.deletedAt).toBeNull();
    // A new Date or Decimal column on Business fails this equality until
    // toCacheable/fromCacheable in lib/business.ts learn about it.
    expect(business).toEqual(row);
  });

  it("getPublicMenuByLang matches what the raw menu would render", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id, { isActive: true });
    await makeMenuItem(business.id, category.id, { basePrice: "42.00" });

    const menu = await getPublicMenuByLang(business.id);

    expect(menu.en.dishes).toHaveLength(1);
    expect(menu.en.dishes[0].priceValue).toBe("42.00");
  });

  it("featured promotions come back with real Date windows", async () => {
    const business = await makeBusiness();
    const startsAt = new Date("2030-01-01T00:00:00.000Z");
    await makePromotion(business.id, { isFeatured: true, startsAt });

    const [promotion] = await listFeaturedPromotionsForLanding(business.id);

    expect(promotion.startsAt).toBeInstanceOf(Date);
    expect(promotion.startsAt?.toISOString()).toBe(startsAt.toISOString());
    expect(promotion.endsAt).toBeNull();
  });

  it("featured testimonials and opening hours read through unchanged", async () => {
    const business = await makeBusiness();
    await makeTestimonial(business.id, { status: "APPROVED", isFeatured: true, authorName: "Ana" });
    await prisma.openingHour.create({
      data: { businessId: business.id, dayOfWeek: 1, opensAt: 540, closesAt: 1320, isClosed: false },
    });

    expect((await listFeaturedTestimonialsForLanding(business.id)).map((t) => t.authorName)).toEqual(["Ana"]);
    expect(await getPublicOpeningHours(business.id)).toEqual([
      { dayOfWeek: 1, opensAt: 540, closesAt: 1320, isClosed: false },
    ]);
  });
});

describe("panel mutations expire the public cache", () => {
  it("toggling a dish's availability expires the menu tag", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);

    await toggleAvailabilityAction(item.id, false);

    expect(updateTagMock).toHaveBeenCalledWith(`menu:${business.id}`);
  });

  it("toggling a category expires the menu tag", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);

    await toggleCategoryActiveAction(category.id, false);

    expect(updateTagMock).toHaveBeenCalledWith(`menu:${business.id}`);
  });

  it("toggling a promotion expires the promotions tag", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });
    const promotion = await makePromotion(business.id);

    await toggleActivePromotionAction(promotion.id, false);

    expect(updateTagMock).toHaveBeenCalledWith(`promotions:${business.id}`);
  });

  it("moderating a testimonial expires the testimonials tag", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });
    const testimonial = await makeTestimonial(business.id, { status: "PENDING" });

    await approveTestimonialAction(testimonial.id);

    expect(updateTagMock).toHaveBeenCalledWith(`testimonials:${business.id}`);
  });

  it("saving the schedule expires the hours tag", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });

    await updateOpeningHoursAction(
      Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isOpen: false, blocks: [] }))
    );

    expect(updateTagMock).toHaveBeenCalledWith(`hours:${business.id}`);
  });

  it("saving business settings expires the row (by slug) and the id-keyed entries", async () => {
    await loginAsAdmin();
    const business = await makeBusiness({ slug: "marea" });
    const form = new FormData();
    form.set("defaultLocale", "es");
    form.set("currency", "MXN");
    form.set("timezone", "America/Hermosillo");
    form.set("defaultReservationMinutes", "90");
    form.set("maxPartySize", "12");
    form.set("minBookingLeadMinutes", "30");
    form.set("minCancelLeadMinutes", "120");

    const result = await updateBusinessSettingsAction(undefined, form);

    expect(result).toEqual({ success: true });
    expect(updateTagMock).toHaveBeenCalledWith("business:slug:marea");
    expect(updateTagMock).toHaveBeenCalledWith("business:default");
    expect(updateTagMock).toHaveBeenCalledWith(`business:${business.id}`);
  });

  it("a failed mutation leaves the cache alone", async () => {
    await loginAsAdmin();
    await makeBusiness({ slug: "marea" });

    await approveTestimonialAction("not-a-real-id");

    expect(updateTagMock).not.toHaveBeenCalled();
  });
});
