import { decimalToString } from "@/lib/dto/money";
import type {
  Order,
  OrderItem,
  OrderItemModifier,
  Payment,
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
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
    })),
  };
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
  paymentStatus: Payment["status"] | null;
  paymentProvider: Payment["provider"] | null;
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
  payments: Payment[];
};

export function toBoardOrderDTO(order: RawBoardOrder): BoardOrderDTO {
  const latestPayment = order.payments[0] ?? null;
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
    paymentStatus: latestPayment?.status ?? null,
    paymentProvider: latestPayment?.provider ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
    })),
  };
}
