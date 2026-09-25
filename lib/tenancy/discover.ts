import "server-only";
import { systemPrisma } from "@/lib/db/system";

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
