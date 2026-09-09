import { describe, expect, it } from "vitest";
import { orderCancelledTemplate } from "./order-cancelled";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = {
  orderNumber: "A-0142",
  orderUrl: "https://marea.test/o/tok_abc",
  reason: "Guest called to cancel",
};

describe("orderCancelledTemplate", () => {
  it.each(["es", "en"] as const)("renders the folio, reason, and link in %s", async (locale) => {
    const email = await orderCancelledTemplate.render(payload, locale, business);

    expect(email.subject).toContain("A-0142");
    for (const surface of [email.html, email.text]) {
      expect(surface).toContain("A-0142");
      expect(surface).toContain("Guest called to cancel");
      expect(surface).toContain(payload.orderUrl);
    }
  });
});
