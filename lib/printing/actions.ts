"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { enqueueKitchenTicket } from "@/lib/printing/queue";
import { buildKitchenTicketDocument } from "@/lib/printing/kitchen-ticket";
import type { Lang } from "@/lib/i18n/lang";

export type ReprintResult = { ok: true } | { ok: false; error: "not_found" };

/**
 * Reprint is first-class, not a queue-internals retry — paper jams, gets
 * wet, gets lost. Always rebuilds the document from the order's current
 * state and enqueues a brand-new job; the original PrintJob row (and its
 * printedAt) stays untouched as history of the first attempt. STAFF and
 * up, same as every other board action per the permission matrix.
 */
export async function reprintKitchenTicketAction(orderId: string): Promise<ReprintResult> {
  await requireRole(...STAFF_ROLES);
  const business = await getCurrentBusiness();

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId: business.id },
    include: { table: true, items: { include: { modifiers: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  const lang: Lang = order.locale === "en" ? "en" : "es";

  await enqueueKitchenTicket(prisma, {
    businessId: business.id,
    orderId: order.id,
    document: buildKitchenTicketDocument({
      orderNumber: order.orderNumber,
      tableLabel: order.table?.code ?? null,
      guestCount: order.guestCount,
      placedAt: order.placedAt,
      timezone: business.timezone,
      lang,
      orderNote: order.notes,
      items: order.items.map((item) => ({
        quantity: item.quantity,
        name: item.nameSnapshot,
        notes: item.notes,
        modifiers: item.modifiers.map((m) => m.nameSnapshot),
      })),
    }),
  });

  revalidatePath("/admin/pedidos");
  return { ok: true };
}
