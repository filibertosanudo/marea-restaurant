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
  const strong = "greenTurtleUmbrella99";

  it("accepts a strong password of at least 12 characters", () => {
    expect(changePasswordSchema.safeParse({ newPassword: strong, confirmPassword: strong }).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = changePasswordSchema.safeParse({ newPassword: strong, confirmPassword: "different1234" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 12 characters", () => {
    const result = changePasswordSchema.safeParse({ newPassword: "short", confirmPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "newPassword" && issue.code === "too_small")).toBe(
        true
      );
    }
  });

  it("rejects a long but predictable password", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "password12345",
      confirmPassword: "password12345",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "newPassword" && issue.code === "custom")).toBe(
        true
      );
    }
  });
});
