import { describe, expect, it } from "vitest";
import { orderReadyTemplate, orderDeliveredTemplate } from "./order-status";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = { orderNumber: "A-0142", orderUrl: "https://marea.test/o/tok_abc" };

describe.each([
  ["order.ready", orderReadyTemplate],
  ["order.delivered", orderDeliveredTemplate],
] as const)("%s template", (_key, template) => {
  it.each(["es", "en"] as const)("renders the folio and link in %s", async (locale) => {
    const email = await template.render(payload, locale, business);

    expect(email.subject).toContain("A-0142");
    for (const surface of [email.html, email.text]) {
      expect(surface).toContain("A-0142");
      expect(surface).toContain(payload.orderUrl);
      expect(surface).toContain(business.name);
    }
  });
});

describe("order.ready vs order.delivered", () => {
  it("use different wording for the same order", async () => {
    const ready = await orderReadyTemplate.render(payload, "en", business);
    const delivered = await orderDeliveredTemplate.render(payload, "en", business);

    expect(ready.subject).not.toBe(delivered.subject);
    expect(ready.text).toContain("ready");
    expect(delivered.text).toContain("delivered");
  });
});
