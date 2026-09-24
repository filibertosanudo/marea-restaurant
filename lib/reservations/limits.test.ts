import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_BOOKING_HORIZON_DAYS } from "./limits";
import { MAX_BOOKING_HORIZON_DAYS as fromSchemas } from "./schemas";

describe("reservation limits", () => {
  it("is the same number the schemas use, whichever module a caller imports it from", () => {
    expect(fromSchemas).toBe(MAX_BOOKING_HORIZON_DAYS);
    expect(MAX_BOOKING_HORIZON_DAYS).toBe(90);
  });

  it("has no imports, so a client component can use it without pulling in zod", () => {
    const source = readFileSync(resolve(import.meta.dirname, "limits.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(/);
  });
});
