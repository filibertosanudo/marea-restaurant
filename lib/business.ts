import "server-only";
import { prisma } from "@/lib/prisma";

const BUSINESS_SLUG = process.env.BUSINESS_SLUG ?? "marea";

/**
 * v1 is single-tenant: one Business row. Every catalog query still goes
 * through this instead of a hardcoded id so multi-tenant later is a filter
 * change, not a rewrite — see docs/DATABASE.md.
 */
export async function getCurrentBusiness() {
  const business = await prisma.business.findUnique({
    where: { slug: BUSINESS_SLUG },
  });
  if (!business) {
    throw new Error(`Business "${BUSINESS_SLUG}" not found — did you run the seed?`);
  }
  return business;
}
