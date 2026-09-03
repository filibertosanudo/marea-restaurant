import { describe, expect, it } from "vitest";
import { getClientIp } from "./rate-limit";

function headersWith(xForwardedFor: string | null, xRealIp: string | null = null) {
  const map = new Map<string, string>();
  if (xForwardedFor !== null) map.set("x-forwarded-for", xForwardedFor);
  if (xRealIp !== null) map.set("x-real-ip", xRealIp);
  return { get: (name: string) => map.get(name) ?? null };
}

describe("getClientIp", () => {
  // TRUSTED_PROXY_COUNT isn't set in test/setup.ts's minimal env, so these
  // rely on the zod schema's own default of 1.

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

  it("never trusts x-forwarded-for at all when trustedProxyCount is 0", () => {
    // A client can set x-forwarded-for itself; with zero trusted proxies
    // (no reverse proxy in front) nothing in it is provably real.
    expect(getClientIp(headersWith("6.6.6.6"), 0)).toBe("unknown");
    expect(getClientIp(headersWith("6.6.6.6", "203.0.113.9"), 0)).toBe("203.0.113.9");
  });

  it("does not trust the leftmost entry when the chain is shorter than trustedProxyCount", () => {
    // Only one hop actually appended — a misconfigured count, or one of
    // two expected proxies failed to append. The single remaining entry
    // could be the client's own spoofed value, so it must not be trusted.
    expect(getClientIp(headersWith("6.6.6.6"), 2)).toBe("unknown");
    expect(getClientIp(headersWith("6.6.6.6", "203.0.113.9"), 2)).toBe("203.0.113.9");
  });
});
