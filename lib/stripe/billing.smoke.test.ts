import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import {
  attachCardToSubscription,
  createBillingCustomer,
  createCardSetupSession,
  createPortalSession,
  priceForPlan,
  retrieveSubscription,
  startTrialSubscription,
} from "@/lib/stripe/billing";
import { mirrorOf } from "@/lib/billing/mirror";
import { PLANS } from "@/lib/billing/plans";

/**
 * The billing calls against a SANDBOX, with the pinned SDK and API version
 * (module 19, phase 6). The rest of the billing tests fake Stripe, and a fake
 * cannot say whether Stripe accepts a customer Account v2 as a subscription's
 * payer, or what a trial that ends without a card really turns into: run
 * against a test clock, it pauses, and resuming it opens an invoice that stays
 * unpaid for an hour unless it is paid on the spot, which is why
 * attachCardToSubscription pays it.
 *
 * Needs the three plan prices in the sandbox (docs/DEPLOY.md). Runs only when
 * STRIPE_SMOKE_SECRET_KEY is set (in .env.local, not committed), and refuses
 * anything but a test key.
 *
 *   STRIPE_SMOKE_SECRET_KEY=sk_test_... npx vitest run lib/stripe/billing.smoke
 */
const key = process.env.STRIPE_SMOKE_SECRET_KEY;
const DAY = 86_400;

describe.skipIf(!key)("platform billing against the sandbox", () => {
  let cached: Stripe | undefined;
  const client = () => (cached ??= new Stripe(key ?? "", { apiVersion: "2026-07-29.dahlia", typescript: true }));
  const accounts: string[] = [];
  const clocks: string[] = [];

  afterAll(async () => {
    await Promise.all(accounts.map((id) => client().v2.core.accounts.close(id, { applied_configurations: ["customer"] }).catch(() => {})));
    await Promise.all(clocks.map((id) => client().testHelpers.testClocks.del(id).catch(() => {})));
  });

  async function advance(clockId: string, to: number) {
    await client().testHelpers.testClocks.advance(clockId, { frozen_time: to });
    for (let i = 0; i < 60; i++) {
      if ((await client().testHelpers.testClocks.retrieve(clockId)).status === "ready") return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`test clock ${clockId} did not settle`);
  }

  it("refuses to run with anything but a test key", () => {
    expect(key).toMatch(/^sk_test_/);
  });

  it("finds every plan's price by lookup_key, monthly in MXN with tax included", async () => {
    for (const plan of Object.values(PLANS)) {
      const price = await priceForPlan(plan.lookupKey, client());
      expect(price).toMatchObject({ currency: "mxn", tax_behavior: "inclusive", recurring: expect.objectContaining({ interval: "month" }) });
    }
  });

  it("starts a trial for a customer account, and opens Checkout and the portal for it", async () => {
    const organizationId = `smoke_${randomUUID()}`;
    const accountId = await createBillingCustomer({ organizationId, name: "Marea billing smoke", email: "smoke-billing@example.com" }, client());
    accounts.push(accountId);
    expect(await createBillingCustomer({ organizationId, name: "Marea billing smoke", email: "smoke-billing@example.com" }, client())).toBe(accountId);

    const price = await priceForPlan(PLANS.cadena.lookupKey, client());
    const subscription = await startTrialSubscription({ organizationId, customerAccountId: accountId, price, quantity: 2 }, client());
    const mirror = mirrorOf(await retrieveSubscription(subscription.id, client()));
    expect(mirror).toMatchObject({ status: "TRIALING", planLookupKey: "marea_cadena", quantity: 2, hasPaymentMethod: false });
    expect(mirror.trialEndsAt!.getTime() - Date.now()).toBeGreaterThan(13 * DAY * 1000);

    const urls = { successUrl: "https://example.com/admin/suscripcion?billing=card", cancelUrl: "https://example.com/admin/suscripcion" };
    expect(new URL(await createCardSetupSession({ customerAccountId: accountId, organizationId, currency: "MXN", ...urls }, client())).hostname).toMatch(/stripe\.com$/);
    expect(new URL(await createPortalSession({ customerAccountId: accountId, returnUrl: urls.cancelUrl }, client())).hostname).toMatch(/stripe\.com$/);

    await client().subscriptions.cancel(subscription.id);
  }, 60_000);

  it("pauses a trial that ends without a card, and a card resumes and pays it", async () => {
    const now = Math.floor(Date.now() / 1000);
    const clock = await client().testHelpers.testClocks.create({ frozen_time: now, name: "marea billing smoke" });
    clocks.push(clock.id);
    // createBillingCustomer cannot attach a test clock; the rest is the app's own code.
    const account = await client().v2.core.accounts.create({
      display_name: "Marea billing smoke (clock)",
      identity: { country: "mx" },
      configuration: { customer: { test_clock: clock.id } },
    });
    accounts.push(account.id);
    const price = await priceForPlan(PLANS.basico.lookupKey, client());
    const subscription = await startTrialSubscription({ organizationId: `smoke_${randomUUID()}`, customerAccountId: account.id, price, quantity: 1 }, client());

    await advance(clock.id, now + 15 * DAY);
    const paused = await retrieveSubscription(subscription.id, client());
    expect(paused.status).toBe("paused");

    const card = await client().paymentMethods.attach("pm_card_visa", { customer_account: account.id });
    await attachCardToSubscription(paused, card.id, client());

    expect(mirrorOf(await retrieveSubscription(subscription.id, client()))).toMatchObject({ status: "ACTIVE", hasPaymentMethod: true });
  }, 180_000);
});
