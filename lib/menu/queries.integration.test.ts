import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listCategoriesRaw,
  getCategoryByIdRaw,
  listMenuItemsRaw,
  getMenuItemByIdRaw,
  listTagsRaw,
  listModifierGroupsRaw,
  getModifierGroupByIdRaw,
  getPublicMenuRaw,
  getPublicMenuItemRaw,
} from "./queries";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeModifierGroup } from "@/test/factories";

describe("menu queries", () => {
  it("listCategoriesRaw excludes deleted categories and counts non-deleted items", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    await makeMenuItem(business.id, category.id);
    await makeMenuCategory(business.id, { deletedAt: new Date() });

    const categories = await listCategoriesRaw(business.id);

    expect(categories).toHaveLength(1);
    expect(categories[0]._count.items).toBe(1);
  });

  it("getCategoryByIdRaw returns null for a deleted category", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id, { deletedAt: new Date() });

    expect(await getCategoryByIdRaw(business.id, category.id)).toBeNull();
  });

  it("listMenuItemsRaw filters by availability and paginates", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    await makeMenuItem(business.id, category.id, { isAvailable: true });
    await makeMenuItem(business.id, category.id, { isAvailable: false });

    const { items, total } = await listMenuItemsRaw(business.id, {
      availability: "available",
      page: 1,
      pageSize: 10,
    });

    expect(total).toBe(1);
    expect(items[0].isAvailable).toBe(true);
  });

  it("getMenuItemByIdRaw returns null for an item outside this business", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const category = await makeMenuCategory(otherBusiness.id);
    const item = await makeMenuItem(otherBusiness.id, category.id);

    expect(await getMenuItemByIdRaw(business.id, item.id)).toBeNull();
  });

  it("listTagsRaw lists a business's own tags", async () => {
    const business = await makeBusiness();
    await prisma.tag.create({ data: { businessId: business.id, slug: "vegan" } });

    const tags = await listTagsRaw(business.id);

    expect(tags).toHaveLength(1);
  });

  it("listModifierGroupsRaw / getModifierGroupByIdRaw exclude deleted groups", async () => {
    const business = await makeBusiness();
    const group = await makeModifierGroup(business.id);
    await makeModifierGroup(business.id, { deletedAt: new Date() });

    const groups = await listModifierGroupsRaw(business.id);
    expect(groups).toHaveLength(1);
    expect(await getModifierGroupByIdRaw(business.id, group.id)).not.toBeNull();
  });

  it("getPublicMenuRaw only returns active categories with available items", async () => {
    const business = await makeBusiness();
    const activeCategory = await makeMenuCategory(business.id, { isActive: true });
    await makeMenuItem(business.id, activeCategory.id, { isAvailable: true });
    const inactiveCategory = await makeMenuCategory(business.id, { isActive: false });
    await makeMenuItem(business.id, inactiveCategory.id, { isAvailable: true });

    const categories = await getPublicMenuRaw(business.id);

    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe(activeCategory.id);
  });

  it("getPublicMenuItemRaw returns null for an item in an inactive category", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id, { isActive: false });
    const item = await makeMenuItem(business.id, category.id);

    expect(await getPublicMenuItemRaw(business.id, item.id)).toBeNull();
  });
});
