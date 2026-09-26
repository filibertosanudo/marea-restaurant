import "server-only";
import { businessCount } from "@/lib/tenancy/discover";
import type { Business } from "@/lib/generated/prisma/client";

export type OnlinePaymentAvailability =
  | { allowed: true }
  | { allowed: false; reason: "no_account" | "account_not_active" };

/**
 * Whether card payments for this business may be taken at all, decided on
 * the server and never by the UI.
 *
 * Two cases, and the second is the reason the first is a rule and not a habit.
 *
 * A business with a connected Stripe account (module 17b) may take cards only
 * while Stripe says that account can: `stripeCardPaymentsStatus` is ACTIVE. An
 * id alone is not permission: a new account has one and can charge nothing until
 * it is verified, and a verified account can be restricted later. The state
 * is refreshed on return from onboarding, by Stripe's account events and when
 * the settings screen is opened. And once an account has started to be
 * connected, the business never goes back to the platform's key: a pending or
 * restricted account means "pay at the register", even for the only business on
 * the deployment, and so does one whose account was disconnected.
 *
 * A business with no account charges to the platform's one Stripe key, so the
 * money lands in the platform's account. That is the owner's own account while
 * they are the only business on the deployment. The moment a second, unrelated
 * business exists, the platform would be holding somebody else's funds: it
 * then has to say "pay at the register" until it connects an account of its own.
 */
export async function onlinePaymentAvailability(
  business: Pick<Business, "stripeAccountId" | "stripeCardPaymentsStatus">
): Promise<OnlinePaymentAvailability> {
  if (business.stripeAccountId) {
    return business.stripeCardPaymentsStatus === "ACTIVE" ? { allowed: true } : { allowed: false, reason: "account_not_active" };
  }
  // No account, but a status: the account was disconnected from the platform (its
  // id is cleared, the status is kept as not active). That business had started to
  // connect, so it does not fall back to the platform's key either.
  if (business.stripeCardPaymentsStatus) return { allowed: false, reason: "account_not_active" };
  return (await businessCount()) <= 1 ? { allowed: true } : { allowed: false, reason: "no_account" };
}

export async function canTakeOnlinePayments(
  business: Pick<Business, "stripeAccountId" | "stripeCardPaymentsStatus">
): Promise<boolean> {
  return (await onlinePaymentAvailability(business)).allowed;
}
