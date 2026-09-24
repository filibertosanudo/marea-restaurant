import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A cheap fingerprint of "has anything the board cares about changed", used
 * only by the polling fallback: never order data, just enough to notice a
 * difference. The latest OrderStatusEvent (new orders and every transition),
 * the latest Payment update (a cash collection touches Payment but not Order),
 * and the till: a shift opening or closing, or a movement, has no other write
 * of its own to key off. These are the same four sources the triggers cover.
 */
export async function getBoardSignature(businessId: string): Promise<string> {
  const [latestEvent, latestPayment, latestCashSession, latestCashMovement] = await Promise.all([
    prisma.orderStatusEvent.findFirst({
      where: { order: { businessId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.payment.findFirst({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true },
    }),
    prisma.cashSession.findFirst({
      where: { businessId },
      orderBy: [{ closedAt: "desc" }, { openedAt: "desc" }],
      select: { id: true, closedAt: true },
    }),
    prisma.cashMovement.findFirst({
      where: { cashSession: { businessId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  return [
    latestEvent?.id ?? "-",
    latestPayment?.id ?? "-",
    latestPayment?.updatedAt.getTime() ?? "-",
    latestCashSession?.id ?? "-",
    latestCashSession?.closedAt?.getTime() ?? "-",
    latestCashMovement?.id ?? "-",
  ].join(":");
}
