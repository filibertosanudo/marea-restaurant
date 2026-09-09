import { describe, expect, it } from "vitest";
import { passwordResetTemplate } from "./password-reset";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = { resetUrl: "https://marea.test/admin/reset-password/tok_abc", expiresInMinutes: 30 };

describe("passwordResetTemplate", () => {
  it.each(["es", "en"] as const)("renders the reset link and expiry in %s", async (locale) => {
    const email = await passwordResetTemplate.render(payload, locale, business);

    for (const surface of [email.html, email.text]) {
      expect(surface).toContain(payload.resetUrl);
      expect(surface).toContain("30");
    }
  });

  it("tells the guest to ignore it if they didn't request it", async () => {
    const en = await passwordResetTemplate.render(payload, "en", business);
    expect(en.text.toLowerCase()).toContain("didn't request");
  });

  it("never logs the token in the subject line", async () => {
    const email = await passwordResetTemplate.render(payload, "en", business);
    expect(email.subject).not.toContain("tok_abc");
  });
});
