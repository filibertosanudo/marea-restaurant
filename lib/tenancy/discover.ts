import "server-only";
import { prisma } from "@/lib/prisma";
import { systemPrisma } from "@/lib/db/system";
import { runWithoutTenant } from "@/lib/tenancy/context";

/**
 * "Which business is this for?", asked of a capability that arrives with no
 * session and no business: a device token, a Stripe event, a link printed on
 * a table. Answered by the system role, which can see these identifiers and
 * business ids and no more (see the RLS migration). What the caller does next
 * goes back through the normal client inside runInTenant().
 *
 * Each of these is unguessable, or signed, or both, so learning the business
 * from it discloses nothing the holder could not already act on.
 */

export async function businessIdForDeviceTokenHash(tokenHash: string): Promise<string | null> {
  const row = await systemPrisma.device.findUnique({ where: { tokenHash }, select: { businessId: true } });
  return row?.businessId ?? null;
}

export async function businessIdForPaymentIntent(stripePaymentIntentId: string): Promise<string | null> {
  const row = await systemPrisma.payment.findUnique({
    where: { stripePaymentIntentId },
    select: { businessId: true },
  });
  return row?.businessId ?? null;
}

export type TokenKind = "table" | "order" | "reservation";

export async function businessIdForToken(kind: TokenKind, token: string): Promise<string | null> {
  const row =
    kind === "table"
      ? await systemPrisma.restaurantTable.findUnique({ where: { qrToken: token }, select: { businessId: true } })
      : kind === "order"
        ? await systemPrisma.order.findUnique({ where: { publicToken: token }, select: { businessId: true } })
        : await systemPrisma.reservation.findUnique({
            where: { confirmationCode: token },
            select: { businessId: true },
          });
  return row?.businessId ?? null;
}

// "Which business does this host name?", asked before any business is known.
// Business rows are scoped to their own business, so this goes through three
// functions that return an id or a count and nothing else (see the RLS
// migration). They run outside any business on purpose.

export function businessIdForSlug(slug: string): Promise<string | null> {
  return runWithoutTenant(async () => {
    const rows = await prisma.$queryRaw<Array<{ id: string | null }>>`SELECT marea_business_id_by_slug(${slug}) AS id`;
    return rows[0]?.id ?? null;
  });
}

/** The id of the only business, or null when there are none or several. */
export function onlyBusinessId(): Promise<string | null> {
  return runWithoutTenant(async () => {
    const rows = await prisma.$queryRaw<Array<{ id: string | null }>>`SELECT marea_only_business_id() AS id`;
    return rows[0]?.id ?? null;
  });
}

export function businessCount(): Promise<number> {
  return runWithoutTenant(async () => {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`SELECT marea_business_count() AS n`;
    return rows[0]?.n ?? 0;
  });
}
