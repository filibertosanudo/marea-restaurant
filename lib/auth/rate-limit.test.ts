import { describe, expect, it } from "vitest";
import { getClientIp } from "./rate-limit";

function headersWith(xForwardedFor: string | null, xRealIp: string | null = null) {
  const map = new Map<string, string>();
  if (xForwardedFor !== null) map.set("x-forwarded-for", xForwardedFor);
  if (xRealIp !== null) map.set("x-real-ip", xRealIp);
  return { get: (name: string) => map.get(name) ?? null };
}

describe("getClientIp", () => {
  // Default TRUSTED_PROXY_COUNT is 1 (set in test/setup.ts's minimal env).

  it("trusts the single hop a direct proxy appends", () => {
    expect(getClientIp(headersWith("203.0.113.9"))).toBe("203.0.113.9");
  });

  it("does not let a spoofed leading value through one trusted proxy", () => {
    // An attacker sends their own x-forwarded-for; the one trusted proxy in
    // front of the app appends the real peer it saw behind that. The real
    // rate-limit key must be the appended value, never the injected one —
    // otherwise every limit this module protects (login, reservations,
    // order creation) is trivially bypassed by rotating a fake header.
    const spoofed = headersWith("6.6.6.6, 203.0.113.9");
    expect(getClientIp(spoofed)).toBe("203.0.113.9");
    expect(getClientIp(spoofed)).not.toBe("6.6.6.6");
  });

  it("still resists a spoofed chain that mimics extra hops", () => {
    const spoofed = headersWith("6.6.6.6, 7.7.7.7, 203.0.113.9");
    expect(getClientIp(spoofed)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when there is no x-forwarded-for", () => {
    expect(getClientIp(headersWith(null, "203.0.113.9"))).toBe("203.0.113.9");
  });

  it("falls back to a fixed key when neither header is present", () => {
    expect(getClientIp(headersWith(null))).toBe("unknown");
  });
});
