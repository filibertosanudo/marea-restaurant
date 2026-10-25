import "server-only";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";
import { businessOrigin } from "@/lib/business-origin";

/**
 * The organization a session's owner acts for, or ForbiddenError. Only the
 * organization's owner (ORG_ADMIN) pays its subscription and adds its
 * branches; a BUSINESS_ADMIN of one branch of a chain runs that branch, not
 * the account. Takes the session requireRole returned, so the role check stays
 * the first line of each action.
 */
export async function organizationOwner(session: Session) {
  if (!session.user.orgAdmin || !session.user.businessId) throw new ForbiddenError("Only the organization's owner manages its account");
  const [user, business] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { organizationId: true, email: true } }),
    getBusinessForRequest(),
  ]);
  // authorizeBusiness already tied the session's business to the owner's
  // organization; checked again because this one decides who pays.
  if (!user.organizationId || user.organizationId !== business.organizationId) {
    throw new ForbiddenError("Only the organization's owner manages its account");
  }
  return { organizationId: user.organizationId, email: user.email, businessId: business.id, origin: businessOrigin(business), currency: business.currency };
}
