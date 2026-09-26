"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// One promise per key and account: Stripe.js is bound to the account it was
// loaded for, so an instance made for the platform cannot confirm a payment
// that lives on a business's connected account, and the reverse. Keyed, not
// single, so switching between them never hands back the wrong one.
const instances = new Map<string, Promise<Stripe | null>>();

/**
 * Loads Stripe.js and reuses the promise for the same key and account — loadStripe
 * injects a <script> tag; calling it again per mount would inject a second one.
 * Only the publishable key and the account id (neither is a secret) reach this
 * file, and both arrive from the server as arguments. `stripeAccountId` is the
 * account the PaymentIntent was created on; null means the platform's own.
 */
export function getStripe(publishableKey: string, stripeAccountId: string | null): Promise<Stripe | null> {
  const cacheKey = `${publishableKey}|${stripeAccountId ?? ""}`;
  let instance = instances.get(cacheKey);
  if (!instance) {
    instance = loadStripe(publishableKey, stripeAccountId ? { stripeAccount: stripeAccountId } : undefined);
    instances.set(cacheKey, instance);
  }
  return instance;
}
