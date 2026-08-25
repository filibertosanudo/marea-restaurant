import "server-only";
import Stripe from "stripe";

/**
 * The one Stripe client instance for the whole app — secret key never
 * crosses to a Client Component (this file has "server-only" precisely to
 * make that a build error, not a convention). Pinned to the SDK's own
 * matching API version rather than left implicit, so a Stripe-side default
 * bump can't silently change response shapes underneath this integration.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-07-29.dahlia",
  typescript: true,
});
