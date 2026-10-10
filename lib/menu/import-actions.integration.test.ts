import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeStaff } from "@/test/factories";
import { sessionUserFromRow, setTestSession } from "@/test/stubs/auth-session";
import { commitMenuImportAction, previewMenuImportAction } from "./import-actions";

async function adminOf(overrides: Record<string, unknown> = {}) {
  const business = await makeBusiness({ slug: "marea", defaultLocale: "es", ...overrides });
  const admin = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(admin, { role: "BUSINESS_ADMIN", businessId: business.id }));
  return business;
}

function upload(fixture: string, extra: Record<string, string> = {}) {
  const bytes = readFileSync(path.resolve(import.meta.dirname, "__fixtures__", fixture));
  const form = new FormData();
  form.set("file", new File([bytes], fixture, { type: "text/csv" }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

const dishes = (businessId: string) =>
  prisma.menuItem.findMany({
    where: { businessId, deletedAt: null },
    include: { translations: true, category: { include: { translations: true } } },
    orderBy: { slug: "asc" },
  });

describe("previewMenuImportAction", () => {
  it("shows every row with its outcome and writes nothing", async () => {
    const business = await adminOf();

    const preview = await previewMenuImportAction(undefined, upload("bad-rows.csv"));

    expect(preview).toMatchObject({ ok: true, counts: { new: 2, duplicates: 1, errors: 3 } });
    expect(await prisma.menuItem.count({ where: { businessId: business.id } })).toBe(0);
    expect(await prisma.menuCategory.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("says what is wrong with a file instead of a generic error", async () => {
    await adminOf();
    expect(await previewMenuImportAction(undefined, upload("missing-columns.csv"))).toEqual({
      ok: false,
      error: "missing_columns",
      missing: ["category", "price"],
    });
    expect(await previewMenuImportAction(undefined, new FormData())).toEqual({ ok: false, error: "no_file" });
  });
});

describe("commitMenuImportAction", () => {
  it("imports a Windows Spanish Excel file: categories made once, prices parsed, accents kept", async () => {
    const business = await adminOf();

    const result = await commitMenuImportAction(undefined, upload("excel-es-windows-1252.csv"));

    expect(result).toEqual({ ok: true, created: 4, updated: 0, skippedExisting: 0, skippedDuplicates: 0, errors: 0 });
    const rows = await dishes(business.id);
    expect(rows.map((r) => [r.translations[0].name, r.basePrice.toString(), r.category.translations[0].name]).sort()).toEqual([
      ["Café americano", "38", "Bebidas"],
      ["Crème brûlée", "89.5", "Postres"],
      ["Enchiladas verdes", "1250", "Platos fuertes"],
      ["Tacos de pescado", "145", "Platos fuertes"],
    ]);
    expect(await prisma.menuCategory.count({ where: { businessId: business.id } })).toBe(3);
    expect(rows.every((r) => !r.isSample)).toBe(true);
  });

  it("imports the good rows of a file with bad ones, and reports the rest", async () => {
    const business = await adminOf();

    const result = await commitMenuImportAction(undefined, upload("bad-rows.csv"));

    expect(result).toEqual({ ok: true, created: 2, updated: 0, skippedExisting: 0, skippedDuplicates: 1, errors: 3 });
    expect(await dishes(business.id)).toHaveLength(2);
  });

  it("does not duplicate on a second upload, and updates the price only when asked", async () => {
    const business = await adminOf();
    await commitMenuImportAction(undefined, upload("excel-es-windows-1252.csv"));
    const tacos = await prisma.menuItem.findFirstOrThrow({ where: { businessId: business.id, slug: "tacos-de-pescado" } });
    await prisma.menuItem.update({ where: { id: tacos.id }, data: { basePrice: "160.00" } });

    const again = await commitMenuImportAction(undefined, upload("excel-es-windows-1252.csv"));
    expect(again).toMatchObject({ created: 0, updated: 0, skippedExisting: 4 });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: tacos.id } })).basePrice.toString()).toBe("160");

    const forced = await commitMenuImportAction(undefined, upload("excel-es-windows-1252.csv", { updateExisting: "on" }));
    expect(forced).toMatchObject({ created: 0, updated: 4, skippedExisting: 0 });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: tacos.id } })).basePrice.toString()).toBe("145");
    expect(await dishes(business.id)).toHaveLength(4);
  });

  it("puts a dish in the category the owner already has, matched without case or accents", async () => {
    const business = await adminOf();
    const existing = await makeMenuCategory(business.id, { slug: "bebidas", translations: { create: { locale: "es", name: "BEBIDAS" } } });
    await makeMenuItem(business.id, existing.id);

    await commitMenuImportAction(undefined, upload("excel-es-windows-1252.csv"));

    const coffee = await prisma.menuItem.findFirstOrThrow({ where: { businessId: business.id, slug: "cafe-americano" } });
    expect(coffee.categoryId).toBe(existing.id);
    expect(await prisma.menuCategory.count({ where: { businessId: business.id, deletedAt: null } })).toBe(3);
  });

  it("only ever writes into the business of the session", async () => {
    const business = await adminOf();
    const other = await makeBusiness({ slug: "cala" });

    await commitMenuImportAction(undefined, upload("excel-utf8-bom.csv"));

    expect(await prisma.menuItem.count({ where: { businessId: business.id } })).toBe(3);
    expect(await prisma.menuItem.count({ where: { businessId: other.id } })).toBe(0);
  });

  it("is for administrators only", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const waiter = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(waiter, { role: "STAFF", businessId: business.id }));

    await expect(commitMenuImportAction(undefined, upload("excel-utf8-bom.csv"))).rejects.toThrow("Insufficient role");
    await expect(previewMenuImportAction(undefined, upload("excel-utf8-bom.csv"))).rejects.toThrow("Insufficient role");
  });

  it("refuses a file over the size limit", async () => {
    await adminOf();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(600 * 1024)], "big.csv"));
    expect(await commitMenuImportAction(undefined, form)).toEqual({ ok: false, error: "too_big" });
  });
});
