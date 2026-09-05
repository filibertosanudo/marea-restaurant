import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleAvailabilityAction,
  softDeleteMenuItemAction,
} from "./item-actions";
import { makeBusiness, makeMenuCategory, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function baseFields(categoryId: string, overrides: Record<string, string> = {}) {
  return {
    categoryId,
    basePrice: "10.00",
    compareAtPrice: "",
    imageUrl: "",
    "en.name": "Lobster Thermidor",
    "en.description": "",
    "en.imageAlt": "",
    "es.name": "",
    "es.description": "",
    "es.imageAlt": "",
    ...overrides,
  };
}

function itemForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createMenuItemAction", () => {
  it("creates a menu item with a derived slug", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);

    const result = await createMenuItemAction(undefined, itemForm(baseFields(category.id)));

    expect(result).toEqual({ success: true });
    const item = await prisma.menuItem.findFirstOrThrow({ where: { businessId: business.id } });
    expect(item.slug).toBe("lobster-thermidor");
    expect(item.basePrice.toString()).toBe("10");
  });

  it("rejects an invalid price", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);

    const result = await createMenuItemAction(
      undefined,
      itemForm(baseFields(category.id, { basePrice: "not-a-price" }))
    );

    expect(result).toMatchObject({ error: "invalid" });
  });
});

describe("updateMenuItemAction", () => {
  it("updates price and translations", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await prisma.menuItem.create({
      data: { businessId: business.id, categoryId: category.id, slug: "lobster", basePrice: "10.00" },
    });

    const result = await updateMenuItemAction(
      undefined,
      itemForm({ id: item.id, ...baseFields(category.id, { basePrice: "15.00" }) })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.basePrice.toString()).toBe("15");
    const translation = await prisma.menuItemTranslation.findFirstOrThrow({
      where: { menuItemId: item.id, locale: "en" },
    });
    expect(translation.name).toBe("Lobster Thermidor");
  });

  it("replaces the item's tags and modifier groups wholesale", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await prisma.menuItem.create({
      data: { businessId: business.id, categoryId: category.id, slug: "lobster", basePrice: "10.00" },
    });
    const tag = await prisma.tag.create({ data: { businessId: business.id, slug: "spicy" } });
    await prisma.menuItemTag.create({ data: { menuItemId: item.id, tagId: tag.id } });

    const form = itemForm({ id: item.id, ...baseFields(category.id) });
    const result = await updateMenuItemAction(undefined, form);

    expect(result).toEqual({ success: true });
    const tags = await prisma.menuItemTag.findMany({ where: { menuItemId: item.id } });
    expect(tags).toHaveLength(0);
  });
});

describe("toggleAvailabilityAction / softDeleteMenuItemAction", () => {
  it("toggles availability", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await prisma.menuItem.create({
      data: { businessId: business.id, categoryId: category.id, slug: "lobster", basePrice: "10.00" },
    });

    await toggleAvailabilityAction(item.id, false);

    const updated = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.isAvailable).toBe(false);
  });

  it("soft-deletes and marks unavailable", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await prisma.menuItem.create({
      data: { businessId: business.id, categoryId: category.id, slug: "lobster", basePrice: "10.00" },
    });

    await softDeleteMenuItemAction(item.id);

    const updated = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.isAvailable).toBe(false);
  });
});
