import { decimalToString } from "@/lib/dto/money";
import { computePaymentSummary, type PaymentSummary } from "@/lib/payments/summary";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  Order,
  OrderItem,
  OrderItemModifier,
  Payment,
  Refund,
  RestaurantTable,
} from "@/lib/generated/prisma/client";

export type TrackedOrderDTO = {
  orderNumber: string;
  status: Order["status"];
  type: Order["type"];
  tableLabel: string | null;
  total: string;
  currency: string;
  placedAt: string;
  cancellationReason: string | null;
  paymentStatus: Payment["status"] | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    modifiers: string[];
  }[];
};

type RawOrder = Order & {
  table: RestaurantTable | null;
  items: (OrderItem & { modifiers: OrderItemModifier[] })[];
  payments: Payment[];
};

export function toTrackedOrderDTO(order: RawOrder): TrackedOrderDTO {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    tableLabel: order.table ? order.table.code : null,
    total: decimalToString(order.total) ?? "0.00",
    currency: order.currency,
    placedAt: order.placedAt.toISOString(),
    cancellationReason: order.cancellationReason,
    paymentStatus: order.payments[0]?.status ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
    })),
  };
}

/**
 * The board's three honest readings of "what does this order owe" — never
 * just two. A due/paid boolean has no room for "money already came back",
 * so a refunded order fell back to reading as "due" (paymentStatus wasn't
 * literally SUCCEEDED) on a screen built to be read at a glance from across
 * the kitchen. NONE covers a cancelled order that was never paid at all —
 * neither "due" (nothing to collect, cancelling already closed its
 * payments) nor "paid" (no money actually moved).
 */
export type PaymentReading = "DUE" | "PAID" | "REFUNDED" | "NONE";

function derivePaymentReading(orderStatus: Order["status"], summary: PaymentSummary): PaymentReading {
  if (summary.refundedTotal.gt(0)) return "REFUNDED";
  if (summary.isSettled) return "PAID";
  return orderStatus === "CANCELLED" ? "NONE" : "DUE";
}

export type BoardOrderDTO = {
  id: string;
  orderNumber: string;
  status: Order["status"];
  type: Order["type"];
  tableLabel: string | null;
  notes: string | null;
  placedAt: string;
  total: string;
  currency: string;
  paymentReading: PaymentReading;
  /** An open (PENDING) cash-register payment exists on this order and it isn't already settled — the one condition the board's "Cobrar" button needs. */
  canCollectCash: boolean;
  items: {
    id: string;
    name: string;
    quantity: number;
    notes: string | null;
    modifiers: string[];
  }[];
};

type RawBoardOrder = Order & {
  table: RestaurantTable | null;
  items: (OrderItem & { modifiers: OrderItemModifier[] })[];
  payments: (Payment & { refunds: Refund[] })[];
};

export function toBoardOrderDTO(order: RawBoardOrder): BoardOrderDTO {
  const summary = computePaymentSummary(order.payments, order.total);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    tableLabel: order.table ? order.table.code : null,
    notes: order.notes,
    placedAt: order.placedAt.toISOString(),
    total: decimalToString(order.total) ?? "0.00",
    currency: order.currency,
    paymentReading: derivePaymentReading(order.status, summary),
    canCollectCash:
      !summary.isSettled && order.payments.some((p) => p.provider === "CASH_REGISTER" && p.status === "PENDING"),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
    })),
  };
}

export type OrderPaymentDetailDTO = {
  orderId: string;
  orderNumber: string;
  currency: string;
  total: string;
  /** Sum of SUCCEEDED payments — "what's been paid", never a single payment's status. */
  paidTotal: string;
  /** Sum of SUCCEEDED refunds. */
  refundedTotal: string;
  /** paidTotal - refundedTotal, floored at 0 — the most a new refund can be for. Computed here, not in the client, per the project's "no amount is calculated on the client" rule. */
  refundableTotal: string;
  isSettled: boolean;
  payments: {
    id: string;
    provider: Payment["provider"];
    status: Payment["status"];
    amount: string;
    paidAt: string | null;
    createdAt: string;
    paymentMethodBrand: string | null;
    paymentMethodLast4: string | null;
    receiptUrl: string | null;
    refunds: {
      id: string;
      amount: string;
      status: Refund["status"];
      reason: string | null;
      createdAt: string;
    }[];
  }[];
};

type RawPaymentDetailOrder = {
  id: string;
  orderNumber: string;
  total: Prisma.Decimal;
  currency: string;
  payments: (Payment & { refunds: Refund[] })[];
};

export function toOrderPaymentDetailDTO(order: RawPaymentDetailOrder): OrderPaymentDetailDTO {
  const summary = computePaymentSummary(order.payments, order.total);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    total: decimalToString(order.total) ?? "0.00",
    paidTotal: decimalToString(summary.paidTotal) ?? "0.00",
    refundedTotal: decimalToString(summary.refundedTotal) ?? "0.00",
    refundableTotal: decimalToString(summary.refundableTotal) ?? "0.00",
    isSettled: summary.isSettled,
    payments: order.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amount: decimalToString(p.amount) ?? "0.00",
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      paymentMethodBrand: p.paymentMethodBrand,
      paymentMethodLast4: p.paymentMethodLast4,
      receiptUrl: p.receiptUrl,
      refunds: p.refunds.map((r) => ({
        id: r.id,
        amount: decimalToString(r.amount) ?? "0.00",
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
    })),
  };
}
