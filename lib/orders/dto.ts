import { decimalToString } from "@/lib/dto/money";
import type {
  Order,
  OrderItem,
  OrderItemModifier,
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
