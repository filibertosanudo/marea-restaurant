"use server";

import { requireRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderPaymentDetailRaw } from "@/lib/orders/queries";
import { toOrderPaymentDetailDTO, type OrderPaymentDetailDTO } from "@/lib/orders/dto";

/**
 * On-demand read behind the payment drawer — not part of the board's
 * initial page load, since most orders never get their drawer opened in a
 * given session and every payment + refund row for every order would be
 * wasted work fetched up front. STAFF and up: seeing what's been paid and
 * with what is the same visibility STAFF already has on the board
 * (paymentStatus/paymentProvider); only the refund action itself is
 * admin-gated, and that's enforced separately when it lands in a later
 * phase.
 */
export async function getOrderPaymentDetailAction(
  orderId: string
): Promise<OrderPaymentDetailDTO | null> {
  await requireRole(...STAFF_ROLES);
  const business = await getCurrentBusiness();

  const order = await getOrderPaymentDetailRaw(business.id, orderId);
  if (!order) return null;

  return toOrderPaymentDetailDTO(order);
}
