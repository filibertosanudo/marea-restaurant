import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsvBytes } from "./csv";
import { dishKey, planMenuImport, MAX_IMPORT_ROWS } from "./import";

const read = (name: string) => decodeCsvBytes(new Uint8Array(readFileSync(path.resolve(import.meta.dirname, "__fixtures__", name))));

describe("planMenuImport", () => {
  it("plans a Windows Spanish Excel file as it was typed: accents, a $ price with a thousands comma, a decimal comma", () => {
    const plan = planMenuImport(read("excel-es-windows-1252.csv"), []);
    if (!plan.ok) throw new Error("expected a plan");

    expect(plan.rows.map((r) => [r.category, r.name, r.price])).toEqual([
      ["Platos fuertes", "Tacos de pescado", "145.00"],
      ["Platos fuertes", "Enchiladas verdes", "1250.00"],
      ["Postres", "Crème brûlée", "89.5"],
      ["Bebidas", "Café americano", "38"],
    ]);
    expect(plan.counts).toEqual({ new: 4, existing: 0, duplicates: 0, errors: 0 });
  });

  it("plans a UTF-8 file with a BOM and English headers", () => {
    const plan = planMenuImport(read("excel-utf8-bom.csv"), []);
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.rows.map((r) => [r.name, r.price, r.description])).toEqual([
      ["Fish tacos", "1250.50", "Fresh, grilled"],
      ["Lemonade", "45", ""],
      ["Año nuevo", "1250", "Un precio con punto de miles"],
    ]);
  });

  it("reports each bad row with its line and the reason, and still plans the good ones", () => {
    const plan = planMenuImport(read("bad-rows.csv"), []);
    if (!plan.ok) throw new Error("expected a plan");

    const byLine = Object.fromEntries(plan.rows.map((r) => [r.line, [r.status, r.problem ?? null]]));
    expect(byLine).toEqual({
      2: ["new", null],
      3: ["error", "missing_name"],
      4: ["error", "bad_price"],
      5: ["error", "missing_category"],
      6: ["duplicate_in_file", null],
      7: ["new", null],
    });
    expect(plan.counts).toEqual({ new: 2, existing: 0, duplicates: 1, errors: 3 });
  });

  it("recognises a dish already imported, ignoring case and accents, so a second upload does not duplicate", () => {
    const existing = [{ id: "d1", category: "PLATOS FUERTES", name: "tacos de pescado" }];
    const plan = planMenuImport(read("excel-es-windows-1252.csv"), existing);
    if (!plan.ok) throw new Error("expected a plan");

    expect(plan.rows[0]).toMatchObject({ status: "existing", existingId: "d1" });
    expect(plan.counts).toMatchObject({ new: 3, existing: 1 });
    expect(dishKey("Café", "Crème")).toBe(dishKey("cafe", "CREME"));
  });

  it("refuses a file without the required columns, naming them, and an empty one", () => {
    expect(planMenuImport(read("missing-columns.csv"), [])).toEqual({ ok: false, error: "missing_columns", missing: ["category", "price"] });
    expect(planMenuImport("nombre;precio;categoria\r\n", [])).toEqual({ ok: false, error: "empty" });
  });

  it("refuses more rows than a menu has", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Cat;Dish ${i};10`);
    expect(planMenuImport(["categoria;nombre;precio", ...rows].join("\n"), [])).toEqual({ ok: false, error: "too_many_rows" });
  });
});
