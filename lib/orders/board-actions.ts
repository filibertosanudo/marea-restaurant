"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireRole, ForbiddenError } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getNextStatus, isCancellable } from "@/lib/orders/state-machine";

const STAFF_UP = [UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;
const ADMIN_UP = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type BoardActionState = { error?: string } | undefined;

/**
 * The board's one-tap "advance" button. STAFF and up — per
 * docs/product/roles-y-alcance.md's permission matrix, advancing status is
 * staff work, not an admin-only one. Rejects anything that isn't the single
 * legal next step server-side (never trusts a target status the client
 * might send), and does the Order update + OrderStatusEvent + notification
 * enqueue in one transaction, per the module's money/state rule.
 */
export async function advanceOrderStatusAction(orderId: string): Promise<BoardActionState> {
  const session = await requireRole(...STAFF_UP);
  const business = await getCurrentBusiness();

  const result = await prisma.$transaction(async (tx) => {
    // Lock the Order row before reading its status. Without this, two
    // overlapping taps on the one-tap advance button (a double-tap before
    // the UI re-renders, or two devices watching the same board) both read
    // the same pre-transaction status, both compute the same nextStatus,
    // and both commit — producing two OrderStatusEvent rows for one real
    // transition. FOR UPDATE makes the second call block until the first
    // commits, then re-read a status that's already moved on.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE id = ${orderId} AND "businessId" = ${business.id} FOR UPDATE
    `;
    if (!locked[0]) return { error: "not_found" } as const;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const nextStatus = getNextStatus(order.status);
    if (!nextStatus) return { error: "no_next_status" } as const;

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        readyAt: nextStatus === "READY" ? new Date() : undefined,
        completedAt: nextStatus === "DELIVERED" ? new Date() : undefined,
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        changedById: session.user.id,
      },
    });

    if ((nextStatus === "READY" || nextStatus === "DELIVERED") && order.guestEmail) {
      const templateKey = `order.${nextStatus.toLowerCase()}`;
      await tx.notificationJob.create({
        data: {
          businessId: business.id,
          channel: "EMAIL",
          templateKey,
          recipientEmail: order.guestEmail,
          // The order itself doesn't persist the guest's browsing language
          // (only the checkout Server Action knows that, at creation time),
          // so status-change notifications fall back to the business's own
          // default locale rather than guessing from unrelated data.
          locale: business.defaultLocale,
          payload: { orderNumber: order.orderNumber, publicToken: order.publicToken },
          relatedOrderId: order.id,
          dedupeKey: `order:${order.id}:${nextStatus}`,
        },
      });
    }

    return undefined;
  });

  if (result?.error) return result;
  revalidatePath("/admin/pedidos");
}

/**
 * Cancelling moves money the other way (nothing gets charged) and is
 * BUSINESS_ADMIN+ only per the permission matrix — checked here, on the
 * server, first line, regardless of whether the UI ever renders a cancel
 * button for the caller's role.
 */
export async function cancelOrderAction(
  orderId: string,
  reason: string
): Promise<BoardActionState> {
  let session;
  try {
    session = await requireRole(...ADMIN_UP);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "forbidden" };
    throw err;
  }

  const business = await getCurrentBusiness();
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "reason_required" };

  const result = await prisma.$transaction(async (tx) => {
    // Same lock-before-read reasoning as advanceOrderStatusAction — two
    // concurrent cancellations of the same order (two admin tabs) must not
    // both commit a CANCELLED transition with possibly different reasons.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE id = ${orderId} AND "businessId" = ${business.id} FOR UPDATE
    `;
    if (!locked[0]) return { error: "not_found" } as const;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!isCancellable(order.status)) return { error: "not_cancellable" } as const;

    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: trimmedReason },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        changedById: session.user.id,
        note: trimmedReason,
      },
    });

    if (order.guestEmail) {
      await tx.notificationJob.create({
        data: {
          businessId: business.id,
          channel: "EMAIL",
          templateKey: "order.cancelled",
          recipientEmail: order.guestEmail,
          payload: { orderNumber: order.orderNumber, reason: trimmedReason },
          relatedOrderId: order.id,
          dedupeKey: `order:${order.id}:CANCELLED`,
        },
      });
    }

    return undefined;
  });

  if (result?.error) return result;
  revalidatePath("/admin/pedidos");
}

/** "Cobrar en efectivo" — STAFF and up, per the matrix. Only ever touches this order's own CASH_REGISTER/PENDING payment. */
export async function collectCashPaymentAction(orderId: string): Promise<BoardActionState> {
  const session = await requireRole(...STAFF_UP);
  const business = await getCurrentBusiness();

  const payment = await prisma.payment.findFirst({
    where: {
      orderId,
      businessId: business.id,
      provider: "CASH_REGISTER",
      status: "PENDING",
    },
  });
  if (!payment) return { error: "not_found" };

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "SUCCEEDED", paidAt: new Date(), collectedByUserId: session.user.id },
  });

  revalidatePath("/admin/pedidos");
}
