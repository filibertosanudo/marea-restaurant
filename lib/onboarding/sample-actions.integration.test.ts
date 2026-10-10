import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeOrder, makeStaff } from "@/test/factories";
import { sessionUserFromRow, setTestSession } from "@/test/stubs/auth-session";
import { reorderCategoriesAction, toggleCategoryActiveAction, updateCategoryAction } from "@/lib/menu/category-actions";
import { adjustMenuItemStockAction, toggleAvailabilityAction, updateMenuItemAction } from "@/lib/menu/item-actions";
import { rotateTableQrAction, toggleTableActiveAction, updateTableAction } from "@/lib/tables/actions";
import { createSampleDataAction, deleteSampleDataAction } from "./sample-actions";

async function adminOf(overrides: Record<string, unknown> = {}) {
  const business = await makeBusiness({ slug: "marea", defaultLocale: "es", ...overrides });
  const admin = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(admin, { role: "BUSINESS_ADMIN", businessId: business.id }));
  return business;
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const sample = (businessId: string) => ({
  items: prisma.menuItem.findMany({ where: { businessId, isSample: true, deletedAt: null } }),
  categories: prisma.menuCategory.findMany({ where: { businessId, isSample: true, deletedAt: null } }),
  tables: prisma.restaurantTable.findMany({ where: { businessId, isSample: true, deletedAt: null } }),
});

describe("createSampleDataAction", () => {
  it("fills an empty restaurant, once, with rows flagged as samples", async () => {
    const business = await adminOf();

    expect(await createSampleDataAction()).toEqual({ ok: true, categories: 2, items: 6, tables: 4 });
    const rows = sample(business.id);
    expect(await rows.items).toHaveLength(6);
    expect(await rows.categories).toHaveLength(2);
    expect(await rows.tables).toHaveLength(4);

    expect(await createSampleDataAction()).toEqual({ ok: false, error: "already_there" });
  });

  it("never mixes itself into a menu somebody already wrote", async () => {
    const business = await adminOf();
    const category = await makeMenuCategory(business.id);
    await makeMenuItem(business.id, category.id);

    expect(await createSampleDataAction()).toEqual({ ok: false, error: "not_empty" });
    expect(await prisma.menuCategory.count({ where: { businessId: business.id, isSample: true } })).toBe(0);
  });
});

describe("deleteSampleDataAction", () => {
  it("removes an untouched sample, leaving the owner's own rows alone", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const own = await makeMenuCategory(business.id, { slug: "mine" });
    const ownItem = await makeMenuItem(business.id, own.id);

    const result = await deleteSampleDataAction();

    expect(result.deleted).toEqual({ items: 6, categories: 2, tables: 4 });
    expect(result.kept).toEqual({ items: 0, categories: 0, tables: 0 });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: ownItem.id } })).deletedAt).toBeNull();
    expect((await prisma.menuCategory.findUniqueOrThrow({ where: { id: own.id } })).deletedAt).toBeNull();
  });

  it("keeps a dish the owner edited, and the category it sits in", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const [dish] = await sample(business.id).items;

    await updateMenuItemAction(
      undefined,
      form({ id: dish.id, categoryId: dish.categoryId, basePrice: "99.00", "es.name": "Mi especialidad", isAvailable: "on" })
    );
    const result = await deleteSampleDataAction();

    const kept = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
    expect(kept.deletedAt).toBeNull();
    expect(kept.isSample).toBe(false);
    expect(result.deleted.items).toBe(5);
    // Its category now holds a dish that is not a sample: it stays.
    const category = await prisma.menuCategory.findUniqueOrThrow({ where: { id: dish.categoryId } });
    expect(category.deletedAt).toBeNull();
    expect(result.kept.categories).toBe(1);
    expect(result.deleted.categories).toBe(1);
  });

  it("keeps a category that holds a real dish, deleting the samples inside it", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const [category] = await sample(business.id).categories;
    const real = await makeMenuItem(business.id, category.id, { isSample: false });

    const result = await deleteSampleDataAction();

    expect((await prisma.menuCategory.findUniqueOrThrow({ where: { id: category.id } })).deletedAt).toBeNull();
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: real.id } })).deletedAt).toBeNull();
    expect(result.kept.categories).toBe(1);
  });

  it("does not break an order that contains a sample dish: the dish stays and becomes the owner's", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const [dish] = await sample(business.id).items;
    const order = await makeOrder(business.id);
    const line = await prisma.orderItem.create({
      data: { orderId: order.id, menuItemId: dish.id, nameSnapshot: "Tacos", unitPrice: "145.00", quantity: 1, lineTotal: "145.00" },
    });

    const result = await deleteSampleDataAction();

    expect(result.kept.items).toBe(1);
    const stillThere = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
    expect(stillThere.deletedAt).toBeNull();
    expect(stillThere.isSample).toBe(false);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: line.id } })).menuItemId).toBe(dish.id);
  });

  it("keeps a table that has a reservation or an order", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const [withReservation, withOrder, untouched] = await sample(business.id).tables;
    const reservedFor = new Date(Date.now() + 86_400_000);
    await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: withReservation.id,
        guestName: "Ana",
        partySize: 2,
        reservedFor,
        endsAt: new Date(reservedFor.getTime() + 3_600_000),
        status: "COMPLETED",
      },
    });
    await makeOrder(business.id, { tableId: withOrder.id });

    const result = await deleteSampleDataAction();

    expect(result.kept.tables).toBe(2);
    expect(result.deleted.tables).toBe(2);
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: withReservation.id } })).deletedAt).toBeNull();
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: withOrder.id } })).deletedAt).toBeNull();
    expect((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: untouched.id } })).deletedAt).not.toBeNull();
  });

  it("never touches another business's samples", async () => {
    await adminOf();
    const other = await makeBusiness({ slug: "cala" });
    const otherCategory = await makeMenuCategory(other.id, { isSample: true });
    await createSampleDataAction();

    await deleteSampleDataAction();

    expect((await prisma.menuCategory.findUniqueOrThrow({ where: { id: otherCategory.id } })).deletedAt).toBeNull();
  });
});

describe("adopting a sample row", () => {
  it("is done by each action that is about one row, and by none that is about the whole list", async () => {
    const business = await adminOf();
    await createSampleDataAction();
    const { items, categories, tables } = sample(business.id);
    const [item, item2, item3] = await items;
    const [category, category2] = await categories;
    const [table, table2, table3] = await tables;

    await toggleAvailabilityAction(item.id, false);
    await prisma.menuItem.update({ where: { id: item2.id }, data: { trackInventory: true, stockQuantity: 5 } });
    await adjustMenuItemStockAction(item2.id, 1);
    await toggleCategoryActiveAction(category.id, false);
    await updateCategoryAction(undefined, form({ id: category2.id, "es.name": "Renombrada" }));
    await toggleTableActiveAction(table.id, false);
    await updateTableAction(undefined, form({ id: table2.id, code: "MESA-9", zone: "", seats: "6" }));
    await rotateTableQrAction(table3.id);

    const flag = async () => ({
      item: (await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } })).isSample,
      stock: (await prisma.menuItem.findUniqueOrThrow({ where: { id: item2.id } })).isSample,
      category: (await prisma.menuCategory.findUniqueOrThrow({ where: { id: category.id } })).isSample,
      renamed: (await prisma.menuCategory.findUniqueOrThrow({ where: { id: category2.id } })).isSample,
      table: (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).isSample,
      edited: (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table2.id } })).isSample,
      rotated: (await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table3.id } })).isSample,
    });
    expect(await flag()).toEqual({ item: false, stock: false, category: false, renamed: false, table: false, edited: false, rotated: false });

    // Reordering says nothing about any one row: the third dish is still a sample.
    await reorderCategoriesAction([category2.id, category.id]);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: item3.id } })).isSample).toBe(true);
  });
});
