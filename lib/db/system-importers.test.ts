import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import allowed from "../../config/system-prisma-importers.json";

// The ESLint rule stops an import; this stops the rule being switched off,
// worked around with a dynamic import() or forgotten in a new directory. Any
// file that names lib/db/system must be on the list, and the list may not
// carry a file that no longer does.
const ROOT = join(__dirname, "..", "..");
const SKIP = new Set(["node_modules", ".next", "generated", "coverage", "dist", ".git", "test-results", "playwright-report"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|mjs|js)$/.test(name) ? [path] : [];
  });
}

describe("systemPrisma importers", () => {
  it("are exactly the files on the list", () => {
    const importers = sourceFiles(ROOT)
      .filter((file) => !file.endsWith("system-importers.test.ts") && !file.endsWith("eslint.config.mjs"))
      .filter((file) => /db\/system["']/.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file).split(sep).join("/"))
      .sort();

    // lib/db/system.ts defines it and is never an importer of itself.
    const expected = allowed.filter((file) => file !== "lib/db/system.ts").sort();
    expect(importers).toEqual(expected);
  });
});
