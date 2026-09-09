import { describe, expect, it } from "vitest";
import { reservationConfirmedTemplate } from "./reservation-confirmed";

const business = { name: "Marea", address: "Av. del Mar 123, CDMX", phone: "+52 55 1234 5678" };
const payload = {
  confirmationCode: "res_xyz789",
  partySize: 4,
  reservedForLabel: "Friday, March 6 · 8:00 PM",
  reservationUrl: "https://marea.test/r/res_xyz789",
};

describe("reservationConfirmedTemplate", () => {
  it.each(["es", "en"] as const)("renders the confirmation code, date, and link in %s", async (locale) => {
    const email = await reservationConfirmedTemplate.render(payload, locale, business);

    expect(email.subject).toContain("res_xyz789");
    for (const surface of [email.html, email.text]) {
      expect(surface).toContain("res_xyz789");
      expect(surface).toContain(payload.reservedForLabel);
      expect(surface).toContain(payload.reservationUrl);
      expect(surface).toContain(business.name);
      expect(surface).toContain(business.address);
      expect(surface).toContain(business.phone);
    }
  });

  it("mentions the party size in the guest's own language", async () => {
    const es = await reservationConfirmedTemplate.render(payload, "es", business);
    const en = await reservationConfirmedTemplate.render(payload, "en", business);

    expect(es.text).toContain("4 personas");
    expect(en.text).toContain("4 guests");
  });
});
