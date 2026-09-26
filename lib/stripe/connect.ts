import "server-only";
import type Stripe from "stripe";
import type { StripeCapabilityStatus } from "@/lib/generated/prisma/client";
import { stripe as platformStripe } from "@/lib/stripe/client";

/**
 * Connected accounts, the platform's side of Stripe Connect (module 17b).
 *
 * Accounts v2, as Stripe's documentation recommends for a new platform; v1 only
 * if v2 lacked something this needs, and it does not (the limits it lists are
 * OAuth, the recipient service agreement, Treasury and card issuing).
 *
 * The values are chosen so that the restaurant is the merchant of record: the
 * charge appears in ITS account, its balance rises with each payment and the
 * disputes are its own, which is what keeps the platform from holding anybody
 * else's money.
 *   - dashboard "full": the restaurant keeps its own Stripe dashboard (it can
 *     refund from there when the platform cannot). Immutable: changing it
 *     means creating a new account.
 *   - fees_collector "stripe": Stripe bills the restaurant directly. The
 *     platform pays no per-account monthly fee.
 *   - losses_collector "stripe": the platform does not answer for a
 *     restaurant's negative balance. There is no risk team here to do it.
 *   - merchant configuration with card_payments requested: what direct charges
 *     need. A "customer" configuration can be added to this same account later
 *     (module 18's subscription) without a separate Customer object.
 *
 * Every function takes the client as an argument, defaulting to the platform's,
 * so the smoke test can run them with a sandbox key of its own.
 */

/** The four states Stripe reports for a capability, and nothing else. */
const KNOWN_STATUSES: Record<string, StripeCapabilityStatus> = {
  active: "ACTIVE",
  pending: "PENDING",
  restricted: "RESTRICTED",
  unsupported: "UNSUPPORTED",
};

/**
 * A status this code does not know is stored as RESTRICTED, never as ACTIVE: an
 * account whose state cannot be read must not be offered to a guest as able to
 * charge cards, and a wrong "cannot" costs one card payment, a wrong "can"
 * costs a failed checkout or worse.
 */
export function mapCardPaymentsStatus(status: string | null | undefined): StripeCapabilityStatus {
  return (status && KNOWN_STATUSES[status]) || "RESTRICTED";
}

export type ConnectedAccountInput = {
  businessId: string;
  businessName: string;
  /** ISO 3166-1 alpha-2, capitals, as Business.country stores it; Stripe's own examples send it in lowercase. */
  country: string;
  currency: string;
  locale: "en" | "es";
  contactEmail: string;
};

/**
 * Creates the connected account for a business. The idempotency key is the
 * business's id: two clicks, or two replicas, that both get past "no account
 * yet" receive the same account back from Stripe for 24 hours instead of
 * creating two, only one of which the database could hold. After that window
 * the caller's own "no account yet" check (a conditional update on the row) is
 * what stops a second one.
 */
export async function createConnectedAccount(
  input: ConnectedAccountInput,
  client: Stripe = platformStripe
): Promise<{ id: string }> {
  const account = await client.v2.core.accounts.create(
    {
      contact_email: input.contactEmail,
      display_name: input.businessName,
      dashboard: "full",
      identity: { country: input.country.toLowerCase() },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      defaults: {
        currency: input.currency.toLowerCase(),
        locales: [input.locale === "es" ? "es-419" : "en-US"],
        responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
      },
      include: ["configuration.merchant", "requirements"],
      metadata: { businessId: input.businessId },
    },
    { idempotencyKey: `connect_account_${input.businessId}` }
  );
  return { id: account.id };
}

export type AccountReading = {
  status: StripeCapabilityStatus;
  /** True when the account lives in the same mode (live or test) as the key that read it. */
  livemode: boolean;
  closed: boolean;
};

/** What Stripe says about an account's card payments right now, mapped to the four states. A closed account is never active. */
export async function readCardPaymentsStatus(accountId: string, client: Stripe = platformStripe): Promise<AccountReading> {
  const account = await client.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "requirements"],
  });
  const closed = account.closed === true;
  const raw = account.configuration?.merchant?.capabilities?.card_payments?.status;
  return { status: closed ? "RESTRICTED" : mapCardPaymentsStatus(raw), livemode: account.livemode, closed };
}

/**
 * A single-use link into Stripe's hosted onboarding for this account. Neither
 * URL carries an identifier: the pages they lead to act on the business of the
 * signed-in administrator, never on anything in the address.
 */
export async function createOnboardingLink(
  accountId: string,
  urls: { returnUrl: string; refreshUrl: string },
  client: Stripe = platformStripe
): Promise<{ url: string }> {
  const link = await client.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        return_url: urls.returnUrl,
        refresh_url: urls.refreshUrl,
      },
    },
  });
  return { url: link.url };
}
