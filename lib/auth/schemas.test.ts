import { describe, it, expect } from "vitest";
import { loginSchema, changePasswordSchema, signupSchema } from "./schemas";

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

describe("signupSchema", () => {
  const strong = "greenTurtleUmbrella99";
  const valid = {
    businessName: "Cala",
    slug: "cala",
    name: "Ana",
    email: "ana@cala.test",
    password: strong,
    confirmPassword: strong,
    company: "",
  };

  it("accepts a well-formed signup with an empty honeypot", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("lowercases and trims the slug", () => {
    const result = signupSchema.safeParse({ ...valid, slug: "  Cala  " });
    expect(result.success && result.data.slug).toBe("cala");
  });

  it("rejects a slug that cannot be a subdomain, with validateSlug's own reason", () => {
    const result = signupSchema.safeParse({ ...valid, slug: "Not Valid!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "slug")).toBe(true);
    }
  });

  it("rejects a reserved slug", () => {
    const result = signupSchema.safeParse({ ...valid, slug: "admin" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: "somethingElse99" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
    }
  });

  it("rejects a weak password", () => {
    const result = signupSchema.safeParse({ ...valid, password: "password12345", confirmPassword: "password12345" });
    expect(result.success).toBe(false);
  });

  it("does not require the honeypot to be absent from the input shape — only checked by the caller", () => {
    // signupAction treats a non-empty company as "pretend it worked", not a
    // validation error — safeParse itself accepts any string here.
    expect(signupSchema.safeParse({ ...valid, company: "a bot filled this" }).success).toBe(true);
  });
});
