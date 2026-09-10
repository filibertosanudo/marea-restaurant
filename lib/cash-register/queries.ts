import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { EVER_SUCCEEDED_PAYMENT_STATUSES } from "@/lib/payments/summary";

type TxClient = Prisma.TransactionClient;

/** Plain, unlocked read — for display only (the "turno abierto" pill on the orders board, the close screen's own GET render). Never used inside a mutation's transaction; see lockOpenCashSessionForUpdate for that. */
export function getOpenCashSessionRaw(businessId: string) {
  return prisma.cashSession.findFirst({
    where: { businessId, closedAt: null },
    include: { openedBy: { select: { name: true } } },
  });
}

/**
 * Locks whatever open session exists (if any) for the duration of the
 * caller's transaction — the same FOR UPDATE pattern
 * lib/orders/board-actions.ts's lockOrderForUpdate uses, applied to the one
 * other row a concurrent write here could race: a close landing between
 * this read and the write that depends on it (a cash collection, a
 * movement, a second close attempt). The partial unique index is what makes
 * "no open session" and "exactly one open session" the only two possible
 * states to lock against.
 */
export async function lockOpenCashSessionForUpdate(
  tx: TxClient,
  businessId: string
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CashSession" WHERE "businessId" = ${businessId} AND "closedAt" IS NULL FOR UPDATE
  `;
  return rows[0] ?? null;
}

export type CashSessionActivity = {
  cashCollected: Prisma.Decimal;
  deposits: Prisma.Decimal;
  withdrawals: Prisma.Decimal;
};

/** The three sums computeExpectedAmount needs, read live for a still-open session (the close screen's preview) or after freezing for a closed one (recomputing the receipt). */
export async function getCashSessionActivityRaw(
  client: TxClient | typeof prisma,
  cashSessionId: string
): Promise<CashSessionActivity> {
  const [payments, movements] = await Promise.all([
    client.payment.findMany({
      where: { cashSessionId, status: { in: EVER_SUCCEEDED_PAYMENT_STATUSES } },
      select: { amount: true },
    }),
    client.cashMovement.findMany({
      where: { cashSessionId },
      select: { type: true, amount: true },
    }),
  ]);

  const zero = new Prisma.Decimal(0);
  return {
    cashCollected: payments.reduce((sum, p) => sum.add(p.amount), zero),
    deposits: movements.filter((m) => m.type === "DEPOSIT").reduce((sum, m) => sum.add(m.amount), zero),
    withdrawals: movements.filter((m) => m.type === "WITHDRAWAL").reduce((sum, m) => sum.add(m.amount), zero),
  };
}

/** Movements for the currently-open (or just-closed) session, newest first — the close screen's own activity list. */
export function listCashMovementsRaw(cashSessionId: string) {
  return prisma.cashMovement.findMany({
    where: { cashSessionId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, refund: { select: { payment: { select: { order: { select: { orderNumber: true } } } } } } },
  });
}

/** Corte history — BUSINESS_ADMIN+ only per the permission matrix, enforced by the caller (this is a plain read with no role check of its own). */
export function listCashSessionsRaw(businessId: string) {
  return prisma.cashSession.findMany({
    where: { businessId, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });
}

/** One closed session's full detail — the printable receipt and the history drawer both read this. */
export function getCashSessionDetailRaw(businessId: string, id: string) {
  return prisma.cashSession.findFirst({
    where: { id, businessId },
    include: {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      movements: {
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { name: true } },
          refund: { select: { payment: { select: { order: { select: { orderNumber: true } } } } } },
        },
      },
    },
  });
}
