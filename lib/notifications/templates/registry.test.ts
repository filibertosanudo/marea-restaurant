import { describe, expect, it } from "vitest";
import { renderTemplate, UnknownTemplateError } from "./registry";

const business = { name: "Marea", address: "Av. del Mar 123", phone: "+52 55 0000 0000" };

describe("renderTemplate", () => {
  it("throws UnknownTemplateError loudly for a templateKey with no matching template", async () => {
    await expect(renderTemplate("order.unknown_status", {}, "es", business)).rejects.toBeInstanceOf(
      UnknownTemplateError
    );
  });

  it("resolves the exact dynamic keys board-actions.ts builds from OrderStatus", async () => {
    const payload = { orderNumber: "A-0001", orderUrl: "https://marea.test/o/tok" };
    await expect(renderTemplate("order.ready", payload, "es", business)).resolves.toBeDefined();
    await expect(renderTemplate("order.delivered", payload, "es", business)).resolves.toBeDefined();
  });

  it("falls back to Spanish for a locale it doesn't recognize", async () => {
    const payload = { orderNumber: "A-0001", orderUrl: "https://marea.test/o/tok" };
    const email = await renderTemplate("order.ready", payload, "fr", business);
    expect(email.subject).toContain("listo");
  });

  it("renders both module 19 signup templates", async () => {
    const verify = await renderTemplate(
      "signup.verify",
      { verifyUrl: "https://marea.test/admin/verify-email/tok", businessName: "Cala", expiresInHours: 48 },
      "es",
      business
    );
    expect(verify.html).toContain("Cala");

    const taken = await renderTemplate(
      "signup.email-taken",
      { loginUrl: "https://marea.test/admin/login", forgotPasswordUrl: "https://marea.test/admin/forgot-password" },
      "en",
      business
    );
    expect(taken.subject).toMatch(/sign up/i);
  });
});
