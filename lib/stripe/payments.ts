import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";

/**
 * Every Stripe call that moves or reads a customer's money, and the account it
 * acts on (module 17b, phase 4).
 *
 * With direct charges the money lives on the business's own Stripe account, so
 * each of these calls must carry `Stripe-Account: acct_...` or it lands on the
 * platform's account instead: a payment that succeeds, in the wrong place. The
 * SDK makes that easy to forget (it is an optional last argument), so this file
 * takes the choice out of the call sites:
 *
 * - `stripeFor(account)` has no default. `null` means the platform's own
 *   account, and has to be written out; leaving the argument off is a type error.
 * - The client it returns exposes only the calls the app makes (nothing else on
 *   the SDK is reachable from it), and adds the account to every one of them.
 * - `@/lib/stripe/client`, the raw SDK, is not importable outside `lib/stripe/`
 *   (ESLint, `no-restricted-imports`), so the unscoped path is not one a later
 *   change can take by accident.
 *
 * Which account is decided by the caller, from data, never from the request:
 * a new payment takes the business's account; everything after that (retrieve,
 * update, cancel, refund, charge details) takes the account stored on the
 * Payment row, which is immutable, so a later reconnect or disconnect of the
 * business cannot redirect a payment that already exists.
 */

export type AccountId = string | null;

/** `stripeAccount` only when there is one: an absent header is the platform's own account. */
function requestOptions(account: AccountId, extra: Stripe.RequestOptions = {}): Stripe.RequestOptions {
  return account ? { ...extra, stripeAccount: account } : extra;
}

export type PaymentsClient = {
  createPaymentIntent(params: Stripe.PaymentIntentCreateParams, idempotencyKey: string): Promise<Stripe.PaymentIntent>;
  retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
  updatePaymentIntent(id: string, params: Stripe.PaymentIntentUpdateParams): Promise<Stripe.PaymentIntent>;
  cancelPaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
  retrieveCharge(id: string): Promise<Stripe.Charge>;
  createRefund(params: Stripe.RefundCreateParams, idempotencyKey: string): Promise<Stripe.Refund>;
  /** Every refund of a charge, all pages: a bare `.list()` stops at ten. */
  listRefunds(chargeId: string): Promise<Stripe.Refund[]>;
};

/** The account is an explicit argument on purpose: see the file comment. */
export function stripeFor(account: AccountId): PaymentsClient {
  const options = (extra?: Stripe.RequestOptions) => requestOptions(account, extra);
  return {
    createPaymentIntent: (params, idempotencyKey) => stripe.paymentIntents.create(params, options({ idempotencyKey })),
    retrievePaymentIntent: (id) => stripe.paymentIntents.retrieve(id, {}, options()),
    updatePaymentIntent: (id, params) => stripe.paymentIntents.update(id, params, options()),
    cancelPaymentIntent: (id) => stripe.paymentIntents.cancel(id, {}, options()),
    retrieveCharge: (id) => stripe.charges.retrieve(id, {}, options()),
    createRefund: (params, idempotencyKey) => stripe.refunds.create(params, options({ idempotencyKey })),
    listRefunds: (chargeId) => stripe.refunds.list({ charge: chargeId }, options()).autoPagingToArray({ limit: 10_000 }),
  };
}

/**
 * Verifies a webhook's signature and parses it. Lives here so the raw client
 * stays private to `lib/stripe/`; the secret is the caller's to choose.
 */
export function constructWebhookEvent(rawBody: string, signature: string, secret: string): Stripe.Event {
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Whether an error means Stripe cannot act on this account any more (the
 * business disconnected the platform, or closed the account) rather than a
 * transient failure. The caller tells the restaurateur to use their own Stripe
 * dashboard; it must never fall back to the platform's account.
 */
export function isAccountUnavailableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { type?: string; code?: string; statusCode?: number };
  return e.type === "StripePermissionError" || e.code === "account_invalid" || e.code === "platform_account_required";
}
