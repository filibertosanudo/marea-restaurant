import { Prisma } from "@/lib/generated/prisma/client";

/**
 * What the drawer should hold right now: the float it opened with, plus
 * every cash payment collected against this shift, plus manual deposits,
 * minus manual withdrawals (a cash refund's automatic withdrawal is just
 * another row in that same sum — see lib/payments/refund-actions.ts). Pure
 * and framework-free so it can be unit-tested without a database, same
 * reasoning as lib/reports/aggregate.ts.
 */
export function computeExpectedAmount(input: {
  openingFloat: Prisma.Decimal;
  cashCollected: Prisma.Decimal;
  deposits: Prisma.Decimal;
  withdrawals: Prisma.Decimal;
}): Prisma.Decimal {
  return input.openingFloat.add(input.cashCollected).add(input.deposits).sub(input.withdrawals);
}

/** counted - expected, stored rather than derived at read time — see CashSession.difference's own schema comment for why. */
export function computeDifference(counted: Prisma.Decimal, expected: Prisma.Decimal): Prisma.Decimal {
  return counted.sub(expected);
}
