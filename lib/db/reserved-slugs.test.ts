import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS } from "@/lib/business-host";

/**
 * marea_signup() (prisma/migrations/20261001000000_add_signup_primitive)
 * validates a slug's reserved names again inside the database, in its own
 * hand-written SQL ARRAY literal — a caller is not trusted just for having
 * checked TypeScript's copy first. The two lists are written in two
 * different languages and cannot share a single source of truth, so this
 * test is the thing that keeps them equal instead of a comment asking
 * nicely: parses the literal out of the migration file itself, not a second
 * hand-copied list in this test, so a future edit to only one of the two
 * real lists is what actually fails.
 */
function reservedSlugsInMigration(): Set<string> {
  const migrationPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "prisma/migrations/20261001000000_add_signup_primitive/migration.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");
  const match = sql.match(/slug = ANY \(ARRAY\[([\s\S]*?)\]\)/);
  if (!match) throw new Error("Could not find the reserved-slug ARRAY literal in the signup migration.");
  const items = match[1].match(/'([^']+)'/g) ?? [];
  return new Set(items.map((item) => item.slice(1, -1)));
}

describe("reserved slugs", () => {
  it("are the same set in lib/business-host.ts and marea_signup()'s own SQL", () => {
    expect(reservedSlugsInMigration()).toEqual(RESERVED_SLUGS);
  });
});
