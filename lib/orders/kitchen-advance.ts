import type { OrderStatus } from "@/lib/generated/prisma/client";

/**
 * What the kitchen screen's one gesture says, per status. Only PENDING and
 * PREPARING have one: a READY order is waiting for the waiter, and the kitchen
 * has no button for handing it over. Typed as a partial record on purpose, so
 * looking up a status without a label is `undefined` to handle, not a cast
 * that renders an empty button.
 */
const KITCHEN_ADVANCE_LABEL_KEY: Partial<Record<OrderStatus, "advanceStart" | "advanceReady">> = {
  PENDING: "advanceStart",
  PREPARING: "advanceReady",
};

export function kitchenAdvanceLabelKey(status: OrderStatus): "advanceStart" | "advanceReady" | null {
  return KITCHEN_ADVANCE_LABEL_KEY[status] ?? null;
}
