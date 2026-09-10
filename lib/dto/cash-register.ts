import { decimalToString } from "@/lib/dto/money";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CashSessionActivity } from "@/lib/cash-register/queries";
import { computeExpectedAmount } from "@/lib/cash-register/expected";

export type OpenCashSessionDTO = {
  id: string;
  openedByName: string;
  openedAt: string;
  openingFloat: string;
};

type OpenSessionRow = {
  id: string;
  openedAt: Date;
  openingFloat: Prisma.Decimal;
  openedBy: { name: string | null };
};

export function toOpenCashSessionDTO(session: OpenSessionRow): OpenCashSessionDTO {
  return {
    id: session.id,
    openedByName: session.openedBy.name ?? "",
    openedAt: session.openedAt.toISOString(),
    openingFloat: decimalToString(session.openingFloat)!,
  };
}

export type CashSessionActivityDTO = {
  openingFloat: string;
  cashCollected: string;
  deposits: string;
  withdrawals: string;
  expected: string;
};

export function toCashSessionActivityDTO(openingFloat: Prisma.Decimal, activity: CashSessionActivity): CashSessionActivityDTO {
  const expected = computeExpectedAmount({ openingFloat, ...activity });
  return {
    openingFloat: decimalToString(openingFloat)!,
    cashCollected: decimalToString(activity.cashCollected)!,
    deposits: decimalToString(activity.deposits)!,
    withdrawals: decimalToString(activity.withdrawals)!,
    expected: decimalToString(expected)!,
  };
}

export type CashMovementDTO = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: string;
  reason: string;
  createdByName: string;
  createdAt: string;
  refundOrderNumber: string | null;
};

type MovementRow = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: Prisma.Decimal;
  reason: string;
  createdAt: Date;
  createdBy: { name: string | null };
  refund: { payment: { order: { orderNumber: string } } } | null;
};

export function toCashMovementDTO(movement: MovementRow): CashMovementDTO {
  return {
    id: movement.id,
    type: movement.type,
    amount: decimalToString(movement.amount)!,
    reason: movement.reason,
    createdByName: movement.createdBy.name ?? "",
    createdAt: movement.createdAt.toISOString(),
    refundOrderNumber: movement.refund?.payment.order.orderNumber ?? null,
  };
}

export type CashSessionHistoryRowDTO = {
  id: string;
  openedByName: string;
  closedByName: string;
  openedAt: string;
  closedAt: string;
  openingFloat: string;
  expectedAmount: string;
  countedAmount: string;
  difference: string;
  notes: string | null;
};

type HistoryRow = {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: Prisma.Decimal;
  expectedAmount: Prisma.Decimal | null;
  countedAmount: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  notes: string | null;
  openedBy: { name: string | null };
  closedBy: { name: string | null } | null;
};

/** Only ever called with rows already filtered to `closedAt: { not: null } }` (see listCashSessionsRaw), so the non-null assertions on the close-time fields are safe. */
export function toCashSessionHistoryRowDTO(session: HistoryRow): CashSessionHistoryRowDTO {
  return {
    id: session.id,
    openedByName: session.openedBy.name ?? "",
    closedByName: session.closedBy?.name ?? "",
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt!.toISOString(),
    openingFloat: decimalToString(session.openingFloat)!,
    expectedAmount: decimalToString(session.expectedAmount)!,
    countedAmount: decimalToString(session.countedAmount)!,
    difference: decimalToString(session.difference)!,
    notes: session.notes,
  };
}

export type CashSessionDetailDTO = CashSessionHistoryRowDTO & { movements: CashMovementDTO[] };

type DetailRow = HistoryRow & { movements: MovementRow[] };

export function toCashSessionDetailDTO(session: DetailRow): CashSessionDetailDTO {
  return {
    ...toCashSessionHistoryRowDTO(session),
    movements: session.movements.map(toCashMovementDTO),
  };
}
