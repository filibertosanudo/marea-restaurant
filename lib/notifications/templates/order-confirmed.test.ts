import { describe, expect, it } from "vitest";
import { orderConfirmedTemplate } from "./order-confirmed";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = {
  orderNumber: "A-0142",
  orderUrl: "https://marea.test/o/tok_abc",
  items: [
    { name: "Lobster Thermidor", quantity: 1, lineTotal: "$620.00" },
    { name: "Sparkling Water", quantity: 2, lineTotal: "$60.00" },
  ],
  total: "$680.00",
  currency: "MXN",
};

describe("orderConfirmedTemplate", () => {
  it.each(["es", "en"] as const)("renders the folio, line items, total, and link in %s", async (locale) => {
    const email = await orderConfirmedTemplate.render(payload, locale, business);

    expect(email.subject).toContain("A-0142");
    for (const surface of [email.html, email.text]) {
      expect(surface).toContain("A-0142");
      expect(surface).toContain("Lobster Thermidor");
      expect(surface).toContain("Sparkling Water");
      expect(surface).toContain("$680.00");
      expect(surface).toContain(payload.orderUrl);
      expect(surface).toContain(business.name);
      expect(surface).toContain(business.address);
    }
  });
});
