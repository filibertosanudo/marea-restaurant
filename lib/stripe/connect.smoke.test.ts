import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import { createConnectedAccount, createOnboardingLink, readCardPaymentsStatus } from "@/lib/stripe/connect";

/**
 * The one test that talks to Stripe: it creates a real connected account in a
 * SANDBOX, reads it back and asks for an onboarding link, with the pinned SDK and
 * API version. It exists because the rest of the Connect tests use a fake client,
 * and a fake cannot say whether Stripe accepts these parameters at this version.
 *
 * It runs only when STRIPE_SMOKE_SECRET_KEY is set (in .env.local, which is not
 * committed), so CI and every other environment skip it, and it refuses any key
 * that is not a test key.
 *
 *   STRIPE_SMOKE_SECRET_KEY=sk_test_... npx vitest run lib/stripe/connect.smoke
 */
const key = process.env.STRIPE_SMOKE_SECRET_KEY;

describe.skipIf(!key)("Stripe Connect against the sandbox", () => {
  const client = new Stripe(key ?? "", { apiVersion: "2026-07-29.dahlia", typescript: true });
  const created: string[] = [];

  afterAll(async () => {
    // Close what this run opened; a closed account cannot be operated on.
    await Promise.all(created.map((id) => client.v2.core.accounts.close(id).catch(() => {})));
  });

  it("refuses to run with anything but a test key", () => {
    expect(key).toMatch(/^sk_test_/);
  });

  it("creates the account with the chosen responsibilities, reads its status and offers an onboarding link", async () => {
    const businessId = `smoke_${randomUUID()}`;
    const input = {
      businessId,
      businessName: "Marea smoke test",
      country: "MX",
      currency: "MXN",
      locale: "es" as const,
      contactEmail: "smoke-test@example.com",
    };

    const account = await createConnectedAccount(input, client);
    created.push(account.id);
    expect(account.id).toMatch(/^acct_/);

    // Same business, same account: the idempotency key holds.
    expect((await createConnectedAccount(input, client)).id).toBe(account.id);

    const reading = await readCardPaymentsStatus(account.id, client);
    expect(["ACTIVE", "PENDING", "RESTRICTED", "UNSUPPORTED"]).toContain(reading.status);
    expect(reading.livemode).toBe(false);
    expect(reading.closed).toBe(false);

    const raw = await client.v2.core.accounts.retrieve(account.id, { include: ["defaults", "configuration.merchant"] });
    expect(raw.dashboard).toBe("full");
    expect(raw.defaults?.responsibilities?.fees_collector).toBe("stripe");
    expect(raw.defaults?.responsibilities?.losses_collector).toBe("stripe");

    const link = await createOnboardingLink(
      account.id,
      { returnUrl: "https://example.com/admin/configuracion?stripe=return", refreshUrl: "https://example.com/admin/configuracion?stripe=refresh" },
      client
    );
    expect(new URL(link.url).hostname).toMatch(/stripe\.com$/);
  }, 60_000);
});
