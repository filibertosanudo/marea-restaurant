import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createCategoryAction,
  updateCategoryAction,
  toggleCategoryActiveAction,
  reorderCategoriesAction,
  deleteCategoryAction,
} from "./category-actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function categoryForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createCategoryAction", () => {
  it("creates a category, deriving a slug from the name", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();

    const result = await createCategoryAction(
      undefined,
      categoryForm({ "en.name": "Main Dishes", "en.description": "", "es.name": "", "es.description": "", isActive: "on" })
    );

    expect(result).toEqual({ success: true });
    const category = await prisma.menuCategory.findFirstOrThrow({ where: { businessId: business.id } });
    expect(category.slug).toBe("main-dishes");
  });

  it("appends a numeric suffix when the derived slug is already taken", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    await prisma.menuCategory.create({ data: { businessId: business.id, slug: "main-dishes" } });

    await createCategoryAction(
      undefined,
      categoryForm({ "en.name": "Main Dishes", "en.description": "", "es.name": "", "es.description": "", isActive: "on" })
    );

    const categories = await prisma.menuCategory.findMany({ where: { businessId: business.id } });
    expect(categories.map((c) => c.slug)).toContain("main-dishes-2");
  });
});

describe("updateCategoryAction", () => {
  it("updates a category's translations and active flag", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await prisma.menuCategory.create({
      data: {
        businessId: business.id,
        slug: "mains",
        isActive: true,
        translations: { create: { locale: "en", name: "Mains" } },
      },
    });

    const result = await updateCategoryAction(
      undefined,
      categoryForm({
        id: category.id,
        "en.name": "Main Courses",
        "en.description": "",
        "es.name": "",
        "es.description": "",
      })
    );

    expect(result).toEqual({ success: true });
    const translation = await prisma.menuCategoryTranslation.findFirstOrThrow({
      where: { categoryId: category.id, locale: "en" },
    });
    expect(translation.name).toBe("Main Courses");
  });

  it("reports not_found for a category outside this business", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness();
    const foreignCategory = await prisma.menuCategory.create({ data: { businessId: otherBusiness.id, slug: "mains" } });

    const result = await updateCategoryAction(
      undefined,
      categoryForm({ id: foreignCategory.id, "en.name": "X", "en.description": "", "es.name": "", "es.description": "" })
    );

    expect(result).toEqual({ error: "not_found" });
  });
});

describe("toggleCategoryActiveAction / reorderCategoriesAction", () => {
  it("toggles active and reorders", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const a = await prisma.menuCategory.create({ data: { businessId: business.id, slug: "a" } });
    const b = await prisma.menuCategory.create({ data: { businessId: business.id, slug: "b" } });

    await toggleCategoryActiveAction(a.id, false);
    await reorderCategoriesAction([b.id, a.id]);

    const updatedA = await prisma.menuCategory.findUniqueOrThrow({ where: { id: a.id } });
    const updatedB = await prisma.menuCategory.findUniqueOrThrow({ where: { id: b.id } });
    expect(updatedA.isActive).toBe(false);
    expect(updatedB.sortOrder).toBe(0);
    expect(updatedA.sortOrder).toBe(1);
  });
});

describe("deleteCategoryAction", () => {
  it("blocks deleting a category that still has menu items", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await prisma.menuCategory.create({ data: { businessId: business.id, slug: "mains" } });
    await prisma.menuItem.create({
      data: { businessId: business.id, categoryId: category.id, slug: "lobster", basePrice: "10.00" },
    });

    const result = await deleteCategoryAction(category.id);

    expect(result).toEqual({ blocked: true });
  });

  it("soft-deletes an empty category", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const category = await prisma.menuCategory.create({ data: { businessId: business.id, slug: "mains" } });

    const result = await deleteCategoryAction(category.id);

    expect(result).toEqual({ blocked: false });
    const updated = await prisma.menuCategory.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.deletedAt).not.toBeNull();
  });
});
