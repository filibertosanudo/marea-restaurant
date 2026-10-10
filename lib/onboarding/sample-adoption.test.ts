import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guarantee for module 19, phase 5, built like
 * lib/ops/read-only-coverage.test.ts: "delete sample data" selects on isSample
 * and nothing else, so an action that changes one specific row and forgets to
 * adopt it is a row the button will delete out from under the restaurant.
 * Walks the files that hold those actions instead of trusting a list of names
 * that goes stale the day someone adds an action.
 *
 * What adopts, and why: anything that expresses intent about ONE row (edit it,
 * toggle it, adjust its stock, rotate its QR, mark it out of service). What
 * does not: creating (the row is never a sample), reordering (it touches every
 * row and says nothing about any of them: dragging a list would otherwise
 * adopt the whole sample), and deleting (the row is gone).
 */

const FILES = ["lib/menu/item-actions.ts", "lib/menu/category-actions.ts", "lib/tables/actions.ts"];

const EXEMPT: Record<string, Record<string, string>> = {
  "lib/menu/item-actions.ts": {
    createMenuItemAction: "creates a row that is never a sample",
    softDeleteMenuItemAction: "the row is gone",
  },
  "lib/menu/category-actions.ts": {
    createCategoryAction: "creates a row that is never a sample",
    reorderCategoriesAction: "touches every row and says nothing about any one",
    deleteCategoryAction: "the row is gone",
  },
  "lib/tables/actions.ts": {
    createTableAction: "creates a row that is never a sample",
    createTablesBatchAction: "creates rows that are never samples",
    reorderTablesAction: "touches every row and says nothing about any one",
    deleteTableAction: "the row is gone",
  },
};

function exportedFunctions(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => ({ name: m[1], index: m.index! }));
  return starts.map((start, i) => ({ name: start.name, body: source.slice(start.index, starts[i + 1]?.index ?? source.length) }));
}

describe("every action on a row that can be a sample adopts it, or says why not", () => {
  for (const file of FILES) {
    const source = readFileSync(path.resolve(import.meta.dirname, "..", "..", file), "utf8");
    const exempt = EXEMPT[file] ?? {};
    for (const { name, body } of exportedFunctions(source)) {
      it(`${file}: ${name}`, () => {
        const adopts = /adoptSample(MenuItem|Category|Table)\(/.test(body);
        if (name in exempt) {
          expect(adopts, `${name} is in EXEMPT but now adopts: drop it from EXEMPT`).toBe(false);
        } else {
          expect(adopts, `${name} changes a row that can be a sample and never adopts it: call adoptSample..., or add it to EXEMPT with a reason`).toBe(true);
        }
      });
    }
  }
});
