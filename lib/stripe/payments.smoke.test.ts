import { describe, expect, it } from "vitest";

/**
 * Against the sandbox: does Stripe honour the account `stripeFor` names, and
 * what does it say about one it cannot reach? The rest of the payment tests use
 * spies, which show the header is sent but not that Stripe reads it that way.
 *
 * Runs only when both are set (in .env.local, not committed):
 *   STRIPE_SMOKE_SECRET_KEY   a sk_test_ key of the platform
 *   STRIPE_SMOKE_ACCOUNT      an acct_ id of a connected account of that platform
 * The account has to accept a test-mode PaymentIntent (a sandbox account does,
 * whatever its onboarding state); what is checked is where each call lands.
 *
 *   STRIPE_SMOKE_SECRET_KEY=sk_test_... STRIPE_SMOKE_ACCOUNT=acct_... npx vitest run lib/stripe/payments.smoke
 */
const key = process.env.STRIPE_SMOKE_SECRET_KEY;
const account = process.env.STRIPE_SMOKE_ACCOUNT;

describe.skipIf(!key || !account)("stripeFor against the sandbox", () => {
  async function client(forAccount: string | null) {
    // lib/env reads the key lazily, on the first real call.
    process.env.STRIPE_SECRET_KEY = key;
    const { stripeFor } = await import("@/lib/stripe/payments");
    return stripeFor(forAccount);
  }

  it("refuses to run with anything but a test key", () => {
    expect(key).toMatch(/^sk_test_/);
    expect(account).toMatch(/^acct_/);
  });

  it("reaches the connected account: an id that exists nowhere is missing there, not found on the platform", async () => {
    const onAccount = await client(account!);
    const err = await onAccount.retrievePaymentIntent("pi_does_not_exist").catch((e) => e);
    expect(err.type).toBe("StripeInvalidRequestError");
    expect(err.code).toBe("resource_missing");
  }, 30_000);

  it("creates the intent on the account named: the account sees it, the platform does not, and it cancels there", async () => {
    const onAccount = await client(account!);
    const onPlatform = await client(null);

    const intent = await onAccount.createPaymentIntent(
      { amount: 5000, currency: "mxn", automatic_payment_methods: { enabled: true } },
      `smoke_${Date.now()}`
    );
    try {
      expect(intent.id).toMatch(/^pi_/);
      expect((await onAccount.retrievePaymentIntent(intent.id)).id).toBe(intent.id);
      // The same id on the platform's own account is a different, empty place.
      const missing = await onPlatform.retrievePaymentIntent(intent.id).catch((e) => e);
      expect(missing.code).toBe("resource_missing");
    } finally {
      expect((await onAccount.cancelPaymentIntent(intent.id)).status).toBe("canceled");
    }
  }, 60_000);

  it("gets a permission error for an account that is not the platform's, which the refund path reads as unreachable", async () => {
    const { isAccountUnavailableError } = await import("@/lib/stripe/payments");
    const stranger = await client("acct_1AAAAAAAAAAAAAAA");
    const err = await stranger.retrievePaymentIntent("pi_x").catch((e) => e);
    expect(isAccountUnavailableError(err)).toBe(true);
  }, 30_000);
});
