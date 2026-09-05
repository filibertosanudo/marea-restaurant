import { describe, it, expect } from "vitest";
import { loginSchema, changePasswordSchema } from "./schemas";

describe("loginSchema", () => {
  it("accepts a well-formed email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts matching passwords of at least 8 characters", () => {
    expect(
      changePasswordSchema.safeParse({ newPassword: "longenough", confirmPassword: "longenough" }).success
    ).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = changePasswordSchema.safeParse({ newPassword: "longenough", confirmPassword: "different" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(changePasswordSchema.safeParse({ newPassword: "short", confirmPassword: "short" }).success).toBe(false);
  });
});
