import "server-only";
import Stripe from "stripe";

/**
 * The one Stripe client instance for the whole app — secret key never
 * crosses to a Client Component (this file has "server-only" precisely to
 * make that a build error, not a convention). Pinned to the SDK's own
 * matching API version rather than left implicit, so a Stripe-side default
 * bump can't silently change response shapes underneath this integration.
 *
 * Built lazily, on first real use — not at import. Next's build inspects
 * route modules (including this one, transitively) to collect page data,
 * and a Docker build stage commonly runs before STRIPE_SECRET_KEY exists as
 * a runtime secret; constructing eagerly turned that inspection step into a
 * hard build failure instead of a normal missing-config error at boot.
 */
function createStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  });
}

let cachedStripe: Stripe | undefined;

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!cachedStripe) cachedStripe = createStripeClient();
    const value = Reflect.get(cachedStripe as object, prop, cachedStripe);
    return typeof value === "function" ? value.bind(cachedStripe) : value;
  },
});
