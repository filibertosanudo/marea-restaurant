import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Stripe always works in the currency's minimum unit — cents for MXN/USD,
 * never the decimal amount. `Decimal("42.00")` is `4200`, computed with
 * `.mul(100)`, never float arithmetic (the classic bug in this integration:
 * `42.00 * 100` is exact in JS, but plenty of decimal amounts aren't).
 * `.toDecimalPlaces(0)` guards against a stray sub-cent value ever reaching
 * Stripe's integer-only field.
 */
export function toStripeAmount(amount: Prisma.Decimal): number {
  return amount.mul(100).toDecimalPlaces(0).toNumber();
}
