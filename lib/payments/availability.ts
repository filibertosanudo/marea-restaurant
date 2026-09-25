import "server-only";
import { businessCount } from "@/lib/tenancy/discover";
import type { Business } from "@/lib/generated/prisma/client";

/**
 * Whether card payments for this business may be taken at all, decided on
 * the server and never by the UI.
 *
 * Every card payment goes through the platform's one Stripe key, so the
 * money lands in the platform's account. That is the owner's own account
 * while they are the only business on the deployment. The moment a second,
 * unrelated business exists, the platform would be holding somebody else's
 * funds: a business may then take cards only through a Stripe account of
 * its own (`stripeAccountId`, wired up in module 17b). Until then it has
 * to say "pay at the register", not quietly route its money to the platform.
 */
export async function canTakeOnlinePayments(business: Pick<Business, "stripeAccountId">): Promise<boolean> {
  if (business.stripeAccountId) return true;
  return (await businessCount()) <= 1;
}
