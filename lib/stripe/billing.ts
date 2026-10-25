import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { env } from "@/lib/env";

/**
 * The platform's own billing: the subscription an organization pays to use
 * Marea (module 19, phase 6).
 *
 * Every call here acts on the PLATFORM's account, never a connected one, and
 * that is the point rather than an omission: the subscription is between the
 * organization and the platform, and its payer is a customer Account v2 made
 * for that purpose, not one of the organization's merchant accounts (a chain
 * has several, a cash-only restaurant has none). So unlike stripeFor(account)
 * there is no account argument to forget, and none of these accept one.
 *
 * Callers pass the client in tests; the default is the shared one.
 */

export type BillingStripe = Pick<Stripe, "v2" | "prices" | "subscriptions" | "checkout" | "billingPortal" | "setupIntents" | "invoices">;

const defaultClient = (): BillingStripe => stripe;

/** Without a platform key there is nothing to bill with: development and CI run without one. */
export function billingEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** Trial length, decided by the owner: 14 days, no card at signup. */
export const TRIAL_DAYS = 14;

export async function createBillingCustomer(
  input: { organizationId: string; name: string; email: string | null },
  client: BillingStripe = defaultClient()
): Promise<string> {
  const account = await client.v2.core.accounts.create(
    {
      display_name: input.name,
      ...(input.email ? { contact_email: input.email } : {}),
      identity: { country: "mx" },
      configuration: { customer: {} },
      metadata: { marea_organization: input.organizationId },
    },
    // One payer per organization, even if the first attempt's response was lost.
    { idempotencyKey: `marea-billing-customer-${input.organizationId}` }
  );
  return account.id;
}

/** The active recurring price for a plan, found by lookup_key: no price id lives in code or config. */
export async function priceForPlan(lookupKey: string, client: BillingStripe = defaultClient()): Promise<Stripe.Price> {
  const { data } = await client.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = data[0];
  if (!price) throw new Error(`No active Stripe price with lookup_key ${lookupKey}`);
  return price;
}

/**
 * Starts the trial: no payment method, and when the trial ends without one the
 * subscription pauses (the owner's decision) instead of cancelling or running
 * up an invoice nobody can pay. What a pause means for the restaurant is the
 * degrade ladder's business (phase 8), not Stripe's.
 */
export async function startTrialSubscription(
  input: { organizationId: string; customerAccountId: string; price: Stripe.Price; quantity: number },
  client: BillingStripe = defaultClient()
): Promise<Stripe.Subscription> {
  return client.subscriptions.create(
    {
      customer_account: input.customerAccountId,
      items: [{ price: input.price.id, quantity: input.quantity }],
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { marea_organization: input.organizationId },
    },
    { idempotencyKey: `marea-billing-subscription-${input.organizationId}` }
  );
}

/** Customer expanded: whether a card is on file can live on the subscription or on its customer. */
export async function retrieveSubscription(id: string, client: BillingStripe = defaultClient()): Promise<Stripe.Subscription> {
  return client.subscriptions.retrieve(id, { expand: ["customer"] });
}

/**
 * Hosted Checkout in setup mode: collects a card and nothing else. The card
 * reaches the subscription only through the webhook (checkout.session.completed),
 * never through the redirect back.
 */
export async function createCardSetupSession(
  input: { customerAccountId: string; organizationId: string; currency: string; successUrl: string; cancelUrl: string },
  client: BillingStripe = defaultClient()
): Promise<string> {
  const session = await client.checkout.sessions.create({
    mode: "setup",
    customer_account: input.customerAccountId,
    currency: input.currency.toLowerCase(),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { marea_organization: input.organizationId },
  });
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
  return session.url;
}

/** Stripe's billing portal: change card, see invoices, change plan or cancel, none of it built here. */
export async function createPortalSession(
  input: { customerAccountId: string; returnUrl: string },
  client: BillingStripe = defaultClient()
): Promise<string> {
  const session = await client.billingPortal.sessions.create({ customer_account: input.customerAccountId, return_url: input.returnUrl });
  return session.url;
}

/** The card a completed setup session saved, from its SetupIntent. */
export async function paymentMethodOfSetupSession(session: Stripe.Checkout.Session, client: BillingStripe = defaultClient()): Promise<string | null> {
  const ref = session.setup_intent;
  if (!ref) return null;
  const intent = typeof ref === "string" ? await client.setupIntents.retrieve(ref) : ref;
  const pm = intent.payment_method;
  return typeof pm === "string" ? pm : (pm?.id ?? null);
}

/**
 * Makes `paymentMethod` the one the subscription charges and collects what is
 * owed with it, now. A paused subscription is resumed first; resuming opens an
 * invoice that Stripe would otherwise try an hour later, with the subscription
 * still paused until then (seen against a test clock). A past-due or unpaid
 * one has its open invoice paid. Either way a restaurant that just gave a card
 * is up to date at once. False when the charge was declined: the invoice stays
 * open, and the next sync mirrors whatever Stripe says.
 */
export async function attachCardToSubscription(
  subscription: Stripe.Subscription,
  paymentMethod: string,
  client: BillingStripe = defaultClient()
): Promise<boolean> {
  await client.subscriptions.update(subscription.id, { default_payment_method: paymentMethod });
  let invoice = subscription.latest_invoice;
  if (subscription.status === "paused") {
    invoice = (await client.subscriptions.resume(subscription.id, { billing_cycle_anchor: "now" })).latest_invoice;
  } else if (subscription.status !== "past_due" && subscription.status !== "unpaid") {
    return true;
  }
  const invoiceId = typeof invoice === "string" ? invoice : invoice?.id;
  if (!invoiceId) return true;
  try {
    const paid = await client.invoices.pay(invoiceId, { payment_method: paymentMethod });
    return paid.status === "paid";
  } catch (err) {
    console.error(`[billing] ${subscription.id}: invoice ${invoiceId} was not paid`, err);
    return false;
  }
}

/** The card Stripe would charge: the subscription's own, else its customer's default. Needs the customer expanded (retrieveSubscription does). */
export function paymentMethodOnFile(subscription: Stripe.Subscription): string | null {
  const own = subscription.default_payment_method;
  if (own) return typeof own === "string" ? own : own.id;
  const customer = typeof subscription.customer === "object" && !subscription.customer.deleted ? subscription.customer : null;
  const fallback = customer?.invoice_settings?.default_payment_method;
  if (!fallback) return null;
  return typeof fallback === "string" ? fallback : fallback.id;
}

/**
 * Hosted Checkout for a new subscription, for an organization whose old one
 * ended (canceled, or expired before its first payment). The new
 * subscription reaches the organization through the webhook
 * (checkout.session.completed), never the redirect.
 */
export async function createSubscriptionCheckout(
  input: { customerAccountId: string; organizationId: string; price: Stripe.Price; quantity: number; successUrl: string; cancelUrl: string },
  client: BillingStripe = defaultClient()
): Promise<string> {
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer_account: input.customerAccountId,
    line_items: [{ price: input.price.id, quantity: input.quantity }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { marea_organization: input.organizationId },
    subscription_data: { metadata: { marea_organization: input.organizationId } },
  });
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
  return session.url;
}

/**
 * Sets how many branches a per-branch subscription bills for. Stripe prorates
 * the change on the next invoice; during the trial there is nothing to prorate.
 */
export async function setSubscriptionQuantity(subscriptionId: string, quantity: number, client: BillingStripe = defaultClient()): Promise<void> {
  const subscription = await client.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  if (!item || item.quantity === quantity) return;
  await client.subscriptions.update(subscriptionId, { items: [{ id: item.id, quantity }], proration_behavior: "create_prorations" });
}
