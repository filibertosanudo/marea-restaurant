"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

/** Loads Stripe.js once and reuses the same promise — loadStripe injects a <script> tag; calling it again per mount would inject a second one. Only the publishable key ever reaches this file, and it arrives from the server as an argument (lib/env.ts reads it). */
export function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
