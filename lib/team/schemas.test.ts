import { describe, it, expect } from "vitest";
import { teamMemberSchema } from "./schemas";

describe("teamMemberSchema", () => {
  it("accepts a valid STAFF or BUSINESS_ADMIN member", () => {
    expect(
      teamMemberSchema.safeParse({ name: "Diego Fuentes", email: "diego@marea.test", role: "STAFF" }).success
    ).toBe(true);
  });

  it("rejects SUPER_ADMIN — not an assignable role from this form", () => {
    expect(
      teamMemberSchema.safeParse({ name: "Diego", email: "diego@marea.test", role: "SUPER_ADMIN" }).success
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(teamMemberSchema.safeParse({ name: "Diego", email: "not-an-email", role: "STAFF" }).success).toBe(false);
  });
});
