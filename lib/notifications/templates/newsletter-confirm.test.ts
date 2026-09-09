import { describe, expect, it } from "vitest";
import { newsletterConfirmTemplate } from "./newsletter-confirm";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = { confirmUrl: "https://marea.test/newsletter/confirm/tok_abc" };

describe("newsletterConfirmTemplate", () => {
  it.each(["es", "en"] as const)("renders the confirm link in %s", async (locale) => {
    const email = await newsletterConfirmTemplate.render(payload, locale, business);

    for (const surface of [email.html, email.text]) {
      expect(surface).toContain(payload.confirmUrl);
      expect(surface).toContain(business.name);
    }
  });

  it("tells the recipient to ignore it if they didn't request it", async () => {
    const en = await newsletterConfirmTemplate.render(payload, "en", business);
    expect(en.text.toLowerCase()).toContain("didn't request");
  });
});
