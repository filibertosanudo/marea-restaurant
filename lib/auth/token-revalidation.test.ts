import { describe, it, expect } from "vitest";
import { isRevokedByPasswordChange } from "./token-revalidation";

describe("isRevokedByPasswordChange", () => {
  it("revokes a token issued before the password change", () => {
    const iat = Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000);
    const passwordChangedAt = new Date("2026-01-01T00:01:00Z");
    expect(isRevokedByPasswordChange(passwordChangedAt, iat)).toBe(true);
  });

  it("keeps a token issued after the password change alive", () => {
    const iat = Math.floor(Date.parse("2026-01-01T00:02:00Z") / 1000);
    const passwordChangedAt = new Date("2026-01-01T00:01:00Z");
    expect(isRevokedByPasswordChange(passwordChangedAt, iat)).toBe(false);
  });

  it("does not revoke when the password was never changed", () => {
    const iat = Math.floor(Date.now() / 1000);
    expect(isRevokedByPasswordChange(null, iat)).toBe(false);
  });

  it("does not revoke when the token has no iat", () => {
    expect(isRevokedByPasswordChange(new Date(), undefined)).toBe(false);
  });

  it("catches the seconds-vs-milliseconds unit mistake", () => {
    // If passwordChangedAt (ms) were compared against a bare token.iat
    // (seconds) without the *1000 conversion, this would wrongly revoke —
    // iat as a raw number is always far larger than any realistic Date.
    const iat = Math.floor(Date.parse("2026-01-01T00:00:01Z") / 1000);
    const passwordChangedAt = new Date("2026-01-01T00:00:00Z");
    expect(isRevokedByPasswordChange(passwordChangedAt, iat)).toBe(false);
  });
});
