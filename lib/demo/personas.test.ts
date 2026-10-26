import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_PERSONAS, isDemoAccount } from "./personas";

describe("demo personas", () => {
  it("are accounts the seed creates, and never the platform's own admin", () => {
    const seed = readFileSync(path.resolve(import.meta.dirname, "..", "..", "prisma/seed.ts"), "utf8");
    for (const persona of DEMO_PERSONAS) expect(seed, persona.email).toContain(`"${persona.email}"`);
    expect(DEMO_PERSONAS.map((persona) => persona.email)).not.toContain("super@marea.test");
  });

  it("never include an account seeded with a forced password change", () => {
    expect(DEMO_PERSONAS.map((persona) => persona.email)).not.toContain("mesero@marea.test");
  });

  it("recognise a demo account whatever its case", () => {
    expect(isDemoAccount(" Owner@Marea.Test ")).toBe(true);
    expect(isDemoAccount("someone@example.com")).toBe(false);
    expect(isDemoAccount(null)).toBe(false);
  });
});
