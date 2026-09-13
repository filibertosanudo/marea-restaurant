import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createPromotionAction,
  updatePromotionAction,
  toggleActivePromotionAction,
  deletePromotionAction,
} from "./actions";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function baseFields(overrides: Record<string, string> = {}) {
  return {
    type: "PERCENTAGE",
    value: "20",
    code: "",
    minOrderTotal: "",
    maxDiscount: "",
    startsAt: "",
    endsAt: "",
    startTime: "",
    endTime: "",
    usageLimit: "",
    perUserLimit: "",
    appliesToOrderType: "",
    "en.title": "Weekend Special",
    "en.description": "",
    "en.badgeLabel": "",
    "es.title": "",
    "es.description": "",
    "es.badgeLabel": "",
    ...overrides,
  };
}

function promotionForm(fields: Record<string, string>, extra: { daysOfWeek?: string[]; menuItemIds?: string[] } = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  for (const day of extra.daysOfWeek ?? []) data.append("daysOfWeek", day);
  for (const id of extra.menuItemIds ?? []) data.append("menuItemIds", id);
  data.set("isActive", "on");
  return data;
}

describe("createPromotionAction", () => {
  it("creates a promotion with a derived slug", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();

    const result = await createPromotionAction(undefined, promotionForm(baseFields()));

    expect(result).toEqual({ success: true });
    const promo = await prisma.promotion.findFirstOrThrow({ where: { businessId: business.id } });
    expect(promo.slug).toBe("weekend-special");
    expect(promo.value.toString()).toBe("20");
    expect(promo.usageCount).toBe(0);
  });

  it("stores daysOfWeek and converts HH:mm times to minutes since midnight", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();

    await createPromotionAction(
      undefined,
      promotionForm(baseFields({ startTime: "18:00", endTime: "22:00" }), { daysOfWeek: ["5", "6", "0"] })
    );

    const promo = await prisma.promotion.findFirstOrThrow({});
    expect(promo.daysOfWeek.sort()).toEqual([0, 5, 6]);
    expect(promo.startMinute).toBe(18 * 60);
    expect(promo.endMinute).toBe(22 * 60);
  });

  it("scopes the promotion to specific dishes via PromotionMenuItem", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const dish = await makeMenuItem(business.id, category.id);

    await createPromotionAction(undefined, promotionForm(baseFields(), { menuItemIds: [dish.id] }));

    const promo = await prisma.promotion.findFirstOrThrow({ include: { menuItems: true } });
    expect(promo.menuItems.map((m) => m.menuItemId)).toEqual([dish.id]);
  });

  it("never links a menu item that belongs to a different business", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness({ slug: "other" });
    const otherCategory = await makeMenuCategory(otherBusiness.id);
    const foreignDish = await makeMenuItem(otherBusiness.id, otherCategory.id);

    await createPromotionAction(undefined, promotionForm(baseFields(), { menuItemIds: [foreignDish.id] }));

    const promo = await prisma.promotion.findFirstOrThrow({ include: { menuItems: true } });
    expect(promo.menuItems).toHaveLength(0);
  });

  it("rejects an invalid value", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();

    const result = await createPromotionAction(
      undefined,
      promotionForm(baseFields({ value: "not-a-number" }))
    );

    expect(result).toMatchObject({ error: "invalid" });
  });

  it("reports code_taken instead of a raw error on a duplicate code", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    await createPromotionAction(undefined, promotionForm(baseFields({ code: "WELCOME15" })));

    const result = await createPromotionAction(
      undefined,
      promotionForm(baseFields({ code: "WELCOME15", "en.title": "Another One" }))
    );

    expect(result).toEqual({ error: "code_taken", fieldErrors: { code: "code_taken" } });
  });
});

describe("updatePromotionAction", () => {
  it("updates fields and translations without touching usageCount", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const promo = await prisma.promotion.create({
      data: { businessId: business.id, slug: "weekend-special", type: "PERCENTAGE", value: "20", usageCount: 7 },
    });

    const result = await updatePromotionAction(
      undefined,
      promotionForm({ id: promo.id, ...baseFields({ value: "30", "en.title": "Weekend Special v2" }) })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(updated.value.toString()).toBe("30");
    expect(updated.usageCount).toBe(7);
    const translation = await prisma.promotionTranslation.findFirstOrThrow({
      where: { promotionId: promo.id, locale: "en" },
    });
    expect(translation.title).toBe("Weekend Special v2");
  });

  it("replaces the promotion's menu-item scope wholesale", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const dishA = await makeMenuItem(business.id, category.id);
    const dishB = await makeMenuItem(business.id, category.id);
    const promo = await prisma.promotion.create({
      data: { businessId: business.id, slug: "combo", type: "PERCENTAGE", value: "20" },
    });
    await prisma.promotionMenuItem.create({ data: { promotionId: promo.id, menuItemId: dishA.id } });

    await updatePromotionAction(
      undefined,
      promotionForm({ id: promo.id, ...baseFields() }, { menuItemIds: [dishB.id] })
    );

    const scope = await prisma.promotionMenuItem.findMany({ where: { promotionId: promo.id } });
    expect(scope.map((m) => m.menuItemId)).toEqual([dishB.id]);
  });

  it("reports not_found for a promotion outside this business", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness({ slug: "other" });
    const promo = await prisma.promotion.create({
      data: { businessId: otherBusiness.id, slug: "not-mine", type: "PERCENTAGE", value: "20" },
    });

    const result = await updatePromotionAction(undefined, promotionForm({ id: promo.id, ...baseFields() }));

    expect(result).toEqual({ error: "not_found" });
  });

  it("never links a menu item that belongs to a different business", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness({ slug: "other" });
    const otherCategory = await makeMenuCategory(otherBusiness.id);
    const foreignDish = await makeMenuItem(otherBusiness.id, otherCategory.id);
    const promo = await prisma.promotion.create({
      data: { businessId: business.id, slug: "combo", type: "PERCENTAGE", value: "20" },
    });

    await updatePromotionAction(
      undefined,
      promotionForm({ id: promo.id, ...baseFields() }, { menuItemIds: [foreignDish.id] })
    );

    const scope = await prisma.promotionMenuItem.findMany({ where: { promotionId: promo.id } });
    expect(scope).toHaveLength(0);
  });
});

describe("toggleActivePromotionAction / deletePromotionAction", () => {
  it("toggles isActive", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const promo = await prisma.promotion.create({
      data: { businessId: business.id, slug: "weekend", type: "PERCENTAGE", value: "20" },
    });

    const result = await toggleActivePromotionAction(promo.id, false);

    expect(result).toEqual({ success: true });
    const updated = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(updated.isActive).toBe(false);
  });

  it("reports not_found instead of throwing for a promotion outside this business", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness({ slug: "other" });
    const promo = await prisma.promotion.create({
      data: { businessId: otherBusiness.id, slug: "not-mine", type: "PERCENTAGE", value: "20" },
    });

    const result = await toggleActivePromotionAction(promo.id, false);

    expect(result).toEqual({ error: "not_found" });
  });

  it("soft-deletes and deactivates, keeping the row for order history", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const promo = await prisma.promotion.create({
      data: { businessId: business.id, slug: "weekend", type: "PERCENTAGE", value: "20" },
    });

    const result = await deletePromotionAction(promo.id);

    expect(result).toEqual({ success: true });
    const updated = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.isActive).toBe(false);
  });
});
