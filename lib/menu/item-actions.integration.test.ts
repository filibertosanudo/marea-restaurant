import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleAvailabilityAction,
  softDeleteMenuItemAction,
  adjustMenuItemStockAction,
} from "./item-actions";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

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

  it("sets the initial stockQuantity when trackInventory is turned on for the first time", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { trackInventory: false });

    const result = await updateMenuItemAction(
      undefined,
      itemForm({
        id: item.id,
        ...baseFields(category.id),
        trackInventory: "on",
        stockQuantity: "12",
        minStockQuantity: "3",
      })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.trackInventory).toBe(true);
    expect(updated.stockQuantity).toBe(12);
    expect(updated.minStockQuantity).toBe(3);
  });

  it("never overwrites stockQuantity once a dish is already tracked", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 7,
    });

    // Simulates the drawer: an already-tracked dish never submits
    // stockQuantity from the form (the field renders a display-only stepper
    // instead), so it defaults to "0" — updateMenuItemAction must ignore it.
    const result = await updateMenuItemAction(
      undefined,
      itemForm({ id: item.id, ...baseFields(category.id), trackInventory: "on" })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.stockQuantity).toBe(7);
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

describe("adjustMenuItemStockAction", () => {
  it("decrements stock and records a MANUAL_ADJUSTMENT movement", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 5,
    });

    const result = await adjustMenuItemStockAction(item.id, -2);

    expect(result).toEqual({ success: true, stockQuantity: 3, isAvailable: true });
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { menuItemId: item.id } });
    expect(movement).toMatchObject({ delta: -2, reason: "MANUAL_ADJUSTMENT", orderId: null });
  });

  it("increments stock", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 3,
    });

    const result = await adjustMenuItemStockAction(item.id, 4);

    expect(result).toEqual({ success: true, stockQuantity: 7, isAvailable: true });
  });

  it("auto-hides the dish once a decrement crosses to zero, and auto-shows it going back up", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 1,
      isAvailable: true,
    });

    const decremented = await adjustMenuItemStockAction(item.id, -1);
    expect(decremented).toEqual({ success: true, stockQuantity: 0, isAvailable: false });

    const incremented = await adjustMenuItemStockAction(item.id, 1);
    expect(incremented).toEqual({ success: true, stockQuantity: 1, isAvailable: true });
  });

  it("rejects taking stock below zero, and leaves no movement behind", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 1,
    });

    const result = await adjustMenuItemStockAction(item.id, -2);

    expect(result).toEqual({ error: "insufficient_stock" });
    const unchanged = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(unchanged.stockQuantity).toBe(1);
    const movements = await prisma.stockMovement.count({ where: { menuItemId: item.id } });
    expect(movements).toBe(0);
  });

  it("reports not_tracked for a dish that doesn't track inventory", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { trackInventory: false });

    const result = await adjustMenuItemStockAction(item.id, 1);

    expect(result).toEqual({ error: "not_tracked" });
  });

  it("reports not_found for a soft-deleted dish, even one that used to track inventory", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 5,
      deletedAt: new Date(),
    });

    const result = await adjustMenuItemStockAction(item.id, 1);

    expect(result).toEqual({ error: "not_found" });
    const unchanged = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(unchanged.stockQuantity).toBe(5);
  });

  it("reports not_found for a dish outside this business", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness({ slug: "other" });
    const otherCategory = await makeMenuCategory(otherBusiness.id);
    const item = await makeMenuItem(otherBusiness.id, otherCategory.id, {
      trackInventory: true,
      stockQuantity: 5,
    });

    const result = await adjustMenuItemStockAction(item.id, 1);

    expect(result).toEqual({ error: "not_found" });
  });

  it("two concurrent decrements on the last unit: one succeeds, the other reports insufficient_stock", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 1,
    });

    const results = await runConcurrently([
      () => adjustMenuItemStockAction(item.id, -1),
      () => adjustMenuItemStockAction(item.id, -1),
    ]);
    const { fulfilled } = partitionSettled(results);
    const succeeded = fulfilled.filter((r) => "success" in r);
    const failed = fulfilled.filter((r) => "error" in r);

    expect(succeeded).toHaveLength(1);
    expect(failed).toEqual([{ error: "insufficient_stock" }]);
    const final = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(final.stockQuantity).toBe(0);
    const movements = await prisma.stockMovement.count({ where: { menuItemId: item.id } });
    expect(movements).toBe(1);
  });
});
