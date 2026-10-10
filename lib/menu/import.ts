import { parseCsv } from "@/lib/menu/csv";
import { parsePrice } from "@/lib/menu/price";

/**
 * The plan for a menu CSV, before anything is written (module 19, phase 5):
 * every row with what would happen to it. The same function backs the preview
 * and the import, so what the owner is shown is what is done.
 *
 * Columns, in any order, matched without caring about case or accents:
 *   category | categoria      required
 *   name | nombre             required
 *   price | precio            required
 *   description | descripcion optional
 * Everything is written in the business's default language. There are no
 * image or modifier columns on purpose: a URL typed in a file would be one the
 * server fetches for whoever typed it, and photos are added afterwards from the
 * screen that already exists.
 *
 * A bad row is reported and skipped, never a reason to refuse the file: the
 * owner fixes those and uploads again, and a dish already imported is
 * recognised (same category and name, ignoring case and accents) and left
 * alone, or updated when they say so, so the second upload does not duplicate.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 512 * 1024;

export type RowProblem = "missing_category" | "missing_name" | "name_too_long" | "bad_price" | "description_too_long" | "category_too_long";

export type PlannedRow = {
  /** 1-based line in the file, counting the header: what the owner sees in Excel. */
  line: number;
  category: string;
  name: string;
  description: string;
  rawPrice: string;
  price: string | null;
  status: "new" | "existing" | "duplicate_in_file" | "error";
  problem?: RowProblem;
  /** The dish this row matches when it already exists. */
  existingId?: string;
};

export type ImportPlan =
  | { ok: false; error: "empty" | "missing_columns" | "too_many_rows"; missing?: string[] }
  | { ok: true; rows: PlannedRow[]; counts: { new: number; existing: number; duplicates: number; errors: number } };

const ALIASES = {
  category: ["category", "categoria"],
  name: ["name", "nombre", "platillo", "producto", "dish", "item"],
  price: ["price", "precio"],
  description: ["description", "descripcion", "detalle"],
} as const;

export function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ExistingDish = { id: string; category: string; name: string };

export function dishKey(category: string, name: string): string {
  return `${normalizeKey(category)}|${normalizeKey(name)}`;
}

export function planMenuImport(text: string, existing: ExistingDish[]): ImportPlan {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "empty" };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };

  const header = table[0].map((cell) => normalizeKey(cell.replace(/^﻿/, "")));
  const column = (field: keyof typeof ALIASES) => header.findIndex((h) => (ALIASES[field] as readonly string[]).includes(h));
  const at = { category: column("category"), name: column("name"), price: column("price"), description: column("description") };
  const missing = (["category", "name", "price"] as const).filter((field) => at[field] < 0);
  if (missing.length > 0) return { ok: false, error: "missing_columns", missing };

  const known = new Map(existing.map((dish) => [dishKey(dish.category, dish.name), dish.id]));
  const seen = new Set<string>();
  const rows: PlannedRow[] = [];

  for (const [index, cells] of table.slice(1).entries()) {
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const row: PlannedRow = {
      line: index + 2,
      category: cell(at.category),
      name: cell(at.name),
      description: cell(at.description),
      rawPrice: cell(at.price),
      price: null,
      status: "new",
    };

    const problem = problemWith(row);
    if (problem) {
      rows.push({ ...row, status: "error", problem });
      continue;
    }
    row.price = parsePrice(row.rawPrice);

    const key = dishKey(row.category, row.name);
    if (seen.has(key)) {
      rows.push({ ...row, status: "duplicate_in_file" });
      continue;
    }
    seen.add(key);
    const existingId = known.get(key);
    rows.push(existingId ? { ...row, status: "existing", existingId } : row);
  }

  const count = (status: PlannedRow["status"]) => rows.filter((r) => r.status === status).length;
  return {
    ok: true,
    rows,
    counts: { new: count("new"), existing: count("existing"), duplicates: count("duplicate_in_file"), errors: count("error") },
  };
}

function problemWith(row: PlannedRow): RowProblem | undefined {
  if (!row.category) return "missing_category";
  if (row.category.length > 120) return "category_too_long";
  if (!row.name) return "missing_name";
  if (row.name.length > 120) return "name_too_long";
  if (parsePrice(row.rawPrice) === null) return "bad_price";
  if (row.description.length > 2000) return "description_too_long";
  return undefined;
}
