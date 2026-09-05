import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: a hash verifies against the same plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects the wrong plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("returns false, not a throw, for a malformed hash", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
  });
});
