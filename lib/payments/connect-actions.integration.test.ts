import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { refreshStripeAccountAction, startStripeOnboardingAction } from "@/lib/payments/connect-actions";
import { onlinePaymentAvailability } from "@/lib/payments/availability";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { setTestHost } from "@/test/stubs/next-headers";

// A fake Stripe with the three v2 calls this module makes. The real thing is
// exercised by lib/stripe/connect.smoke.test.ts, against the sandbox, when a key is set.
const stripeFake = vi.hoisted(() => {
  const state = {
    accounts: new Map<string, string>(), // idempotency key -> account id
    created: 0,
    status: "pending" as string | undefined,
    livemode: false,
    closed: false,
    failCreate: false,
    forceId: null as string | null,
  };
  return {
    state,
    create: vi.fn(async (_params: unknown, options: { idempotencyKey: string }) => {
      if (state.failCreate) throw new Error("stripe is down");
      const existing = state.accounts.get(options.idempotencyKey);
      if (existing) return { id: existing };
      state.created += 1;
      const id = state.forceId ?? `acct_${state.created}`;
      state.accounts.set(options.idempotencyKey, id);
      return { id };
    }),
    retrieve: vi.fn(async (id: string) => ({
      id,
      livemode: state.livemode,
      closed: state.closed,
      configuration: { merchant: { capabilities: { card_payments: { status: state.status } } } },
    })),
    link: vi.fn(async (params: { account: string }) => ({ url: `https://connect.stripe.com/setup/${params.account}` })),
  };
});

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    v2: { core: { accounts: { create: stripeFake.create, retrieve: stripeFake.retrieve }, accountLinks: { create: stripeFake.link } } },
  },
}));

beforeEach(() => {
  Object.assign(stripeFake.state, { accounts: new Map(), created: 0, status: "pending", livemode: false, closed: false, failCreate: false, forceId: null });
  vi.clearAllMocks();
});

async function adminOf(slug: string, overrides: Record<string, unknown> = {}) {
  const business = await makeBusiness({ slug, name: `Shop ${slug}`, country: "MX", currency: "USD", ...overrides });
  const admin = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(admin, { role: "BUSINESS_ADMIN", businessId: business.id }));
  setTestHost(`${slug}.localhost`);
  return { business, admin };
}

const row = (id: string) => prisma.business.findUniqueOrThrow({ where: { id } });

describe("startStripeOnboardingAction", () => {
  it("takes no argument: the account id can only come from Stripe or from the row", () => {
    expect(startStripeOnboardingAction.length).toBe(0);
    expect(refreshStripeAccountAction.length).toBe(0);
  });

  it("needs an administrator, and touches Stripe for nobody else", async () => {
    const business = await makeBusiness({ slug: "a", country: "MX" });
    const waiter = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(waiter, { role: "STAFF", businessId: business.id }));

    await expect(startStripeOnboardingAction()).rejects.toThrow("Insufficient role");
    expect(stripeFake.create).not.toHaveBeenCalled();
  });

  it("does not start without the restaurant's country", async () => {
    const { business } = await adminOf("a", { country: null });

    expect(await startStripeOnboardingAction()).toEqual({ ok: false, error: "country_required" });
    expect(stripeFake.create).not.toHaveBeenCalled();
    expect((await row(business.id)).stripeAccountId).toBeNull();
  });

  it("creates the account with the chosen values, records it as pending and returns the hosted link", async () => {
    const { business, admin } = await adminOf("a");

    const result = await startStripeOnboardingAction();

    expect(result).toEqual({ ok: true, url: "https://connect.stripe.com/setup/acct_1" });
    expect(stripeFake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: admin.email,
        display_name: "Shop a",
        dashboard: "full",
        identity: { country: "mx" },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        // No currency: Stripe derives the payout currency from the country and rejects e.g. usd in MX.
        defaults: { locales: ["es-419"], responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
        metadata: { businessId: business.id },
      }),
      { idempotencyKey: expect.stringMatching(new RegExp(`^connect_account_${business.id}_[0-9a-f]{16}$`)) }
    );
    const saved = await row(business.id);
    expect(saved).toMatchObject({ stripeAccountId: "acct_1", stripeCardPaymentsStatus: "PENDING" });
    expect(saved.stripeStatusCheckedAt).not.toBeNull();
    // Neither return address carries an identifier of any kind.
    const urls = stripeFake.link.mock.calls[0][0] as unknown as { use_case: { account_onboarding: { return_url: string; refresh_url: string } } };
    expect(urls.use_case.account_onboarding.return_url).toBe("http://localhost:3000/admin/configuracion?stripe=return");
    expect(urls.use_case.account_onboarding.refresh_url).toBe("http://localhost:3000/admin/configuracion?stripe=refresh");
  });

  it("asks Stripe for English defaults when the business's language is English", async () => {
    await adminOf("a", { defaultLocale: "en" });

    await startStripeOnboardingAction();

    expect(stripeFake.create).toHaveBeenCalledWith(
      expect.objectContaining({ defaults: expect.objectContaining({ locales: ["en-US"] }) }),
      expect.anything()
    );
  });

  it("resumes an existing account with a fresh link instead of creating a second one", async () => {
    const { business } = await adminOf("a");
    await startStripeOnboardingAction();

    const again = await startStripeOnboardingAction();

    expect(again).toEqual({ ok: true, url: "https://connect.stripe.com/setup/acct_1" });
    expect(stripeFake.state.created).toBe(1);
    expect((await row(business.id)).stripeAccountId).toBe("acct_1");
  });

  it("needs no link for an account that is already active", async () => {
    const { business } = await adminOf("a");
    await startStripeOnboardingAction();
    stripeFake.state.status = "active";
    stripeFake.link.mockClear();

    expect(await startStripeOnboardingAction()).toEqual({ ok: true, done: true, status: "ACTIVE" });
    expect(stripeFake.link).not.toHaveBeenCalled();
    expect((await row(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });

  it("ends with one account when two requests race", async () => {
    const { business } = await adminOf("a");

    const [first, second] = await Promise.all([startStripeOnboardingAction(), startStripeOnboardingAction()]);

    expect(first.ok && second.ok).toBe(true);
    expect((await row(business.id)).stripeAccountId).toBe("acct_1");
    expect(await prisma.business.count({ where: { stripeAccountId: { not: null } } })).toBe(1);
  });

  it("uses the account another request connected first, when it wins between our Stripe call and our write", async () => {
    const { business } = await adminOf("a");
    stripeFake.create.mockImplementationOnce(async () => {
      await prisma.business.update({ where: { id: business.id }, data: { stripeAccountId: "acct_first", stripeCardPaymentsStatus: "PENDING" } });
      return { id: "acct_second" };
    });

    const result = await startStripeOnboardingAction();

    expect(result).toEqual({ ok: true, url: "https://connect.stripe.com/setup/acct_first" });
    expect((await row(business.id)).stripeAccountId).toBe("acct_first");
  });

  it("answers stripe_unavailable, not a crash, when the database fails while recording the account", async () => {
    const { business } = await adminOf("a");
    const spy = vi.spyOn(prisma.business, "updateMany").mockRejectedValueOnce(new Error("connection reset"));

    expect(await startStripeOnboardingAction()).toEqual({ ok: false, error: "stripe_unavailable" });
    spy.mockRestore();
    expect((await row(business.id)).stripeAccountId).toBeNull();
  });

  it("says so, in plain terms, when the account already belongs to another business", async () => {
    await makeBusiness({ slug: "other", stripeAccountId: "acct_taken" });
    const { business } = await adminOf("a");
    stripeFake.state.forceId = "acct_taken";

    expect(await startStripeOnboardingAction()).toEqual({ ok: false, error: "account_in_use" });
    expect((await row(business.id)).stripeAccountId).toBeNull();
  });

  it("answers stripe_unavailable, and writes nothing, when Stripe fails", async () => {
    const { business } = await adminOf("a");
    stripeFake.state.failCreate = true;

    expect(await startStripeOnboardingAction()).toEqual({ ok: false, error: "stripe_unavailable" });
    expect((await row(business.id)).stripeAccountId).toBeNull();
  });

  it("refuses an account of the other mode, live or test, and records nothing about it", async () => {
    const { business } = await adminOf("a", { stripeAccountId: "acct_live", stripeCardPaymentsStatus: "PENDING" });
    stripeFake.state.livemode = true;

    expect(await startStripeOnboardingAction()).toEqual({ ok: false, error: "livemode_mismatch" });
    expect((await row(business.id)).stripeStatusCheckedAt).toBeNull();
  });
});

describe("refreshStripeAccountAction", () => {
  it("has nothing to read for a business without an account", async () => {
    await adminOf("a");
    expect(await refreshStripeAccountAction()).toEqual({ ok: false, error: "no_account" });
    expect(stripeFake.retrieve).not.toHaveBeenCalled();
  });

  it("records the four states Stripe reports, for the account the row holds", async () => {
    const { business } = await adminOf("a", { stripeAccountId: "acct_mine", stripeCardPaymentsStatus: "PENDING" });

    for (const [reported, stored] of [["active", "ACTIVE"], ["pending", "PENDING"], ["restricted", "RESTRICTED"], ["unsupported", "UNSUPPORTED"]] as const) {
      stripeFake.state.status = reported;
      expect(await refreshStripeAccountAction()).toEqual({ ok: true, status: stored });
      expect((await row(business.id)).stripeCardPaymentsStatus).toBe(stored);
    }
    expect(stripeFake.retrieve).toHaveBeenCalledWith("acct_mine", expect.anything());
  });

  it("stores a state it does not recognise, and a closed account, as not active", async () => {
    const { business } = await adminOf("a", { stripeAccountId: "acct_mine", stripeCardPaymentsStatus: "ACTIVE" });

    stripeFake.state.status = "under_review";
    expect(await refreshStripeAccountAction()).toEqual({ ok: true, status: "RESTRICTED" });
    stripeFake.state.status = "active";
    stripeFake.state.closed = true;
    expect(await refreshStripeAccountAction()).toEqual({ ok: true, status: "RESTRICTED" });
    stripeFake.state.status = undefined;
    stripeFake.state.closed = false;
    expect(await refreshStripeAccountAction()).toEqual({ ok: true, status: "RESTRICTED" });
    expect((await row(business.id)).stripeCardPaymentsStatus).toBe("RESTRICTED");
  });

  it("reads and writes only the signed-in business's account, never another's", async () => {
    const other = await makeBusiness({ slug: "other", stripeAccountId: "acct_other", stripeCardPaymentsStatus: "PENDING" });
    const { business } = await adminOf("a", { stripeAccountId: "acct_mine", stripeCardPaymentsStatus: "PENDING" });
    stripeFake.state.status = "active";

    await refreshStripeAccountAction();

    expect(stripeFake.retrieve).toHaveBeenCalledTimes(1);
    expect(stripeFake.retrieve).toHaveBeenCalledWith("acct_mine", expect.anything());
    expect((await row(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
    expect((await row(other.id)).stripeCardPaymentsStatus).toBe("PENDING");
  });

  it("refuses to record an account of the other mode on refresh too", async () => {
    const { business } = await adminOf("a", { stripeAccountId: "acct_live", stripeCardPaymentsStatus: "PENDING" });
    stripeFake.state.livemode = true;

    expect(await refreshStripeAccountAction()).toEqual({ ok: false, error: "livemode_mismatch" });
    expect((await row(business.id)).stripeStatusCheckedAt).toBeNull();
  });

  it("answers stripe_unavailable when Stripe cannot be read, and changes nothing", async () => {
    const { business } = await adminOf("a", { stripeAccountId: "acct_mine", stripeCardPaymentsStatus: "ACTIVE" });
    stripeFake.retrieve.mockRejectedValueOnce(new Error("timeout"));

    expect(await refreshStripeAccountAction()).toEqual({ ok: false, error: "stripe_unavailable" });
    expect((await row(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });
});

describe("onlinePaymentAvailability", () => {
  it("lets a business with an account take cards only while that account is active", async () => {
    for (const status of ["PENDING", "RESTRICTED", "UNSUPPORTED", null] as const) {
      expect(await onlinePaymentAvailability({ stripeAccountId: "acct_x", stripeCardPaymentsStatus: status })).toEqual({ allowed: false, reason: "account_not_active" });
    }
    expect(await onlinePaymentAvailability({ stripeAccountId: "acct_x", stripeCardPaymentsStatus: "ACTIVE" })).toEqual({ allowed: true });
  });

  it("never sends a business that started connecting back to the platform's key, even alone on the deployment", async () => {
    await makeBusiness({ slug: "only" });
    expect(await onlinePaymentAvailability({ stripeAccountId: "acct_x", stripeCardPaymentsStatus: "PENDING" })).toEqual({ allowed: false, reason: "account_not_active" });
  });

  it("does not send a business whose account was disconnected back to the platform's key either", async () => {
    await makeBusiness({ slug: "only" });
    // The id is cleared on disconnection; the status it leaves behind is what remembers.
    expect(await onlinePaymentAvailability({ stripeAccountId: null, stripeCardPaymentsStatus: "RESTRICTED" })).toEqual({ allowed: false, reason: "account_not_active" });
  });

  it("keeps the earlier rule for a business with no account", async () => {
    await makeBusiness({ slug: "only" });
    expect(await onlinePaymentAvailability({ stripeAccountId: null, stripeCardPaymentsStatus: null })).toEqual({ allowed: true });

    await makeBusiness({ slug: "second" });
    expect(await onlinePaymentAvailability({ stripeAccountId: null, stripeCardPaymentsStatus: null })).toEqual({ allowed: false, reason: "no_account" });
  });
});
