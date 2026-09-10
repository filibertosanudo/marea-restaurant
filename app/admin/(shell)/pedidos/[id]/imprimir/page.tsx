import { notFound } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { prisma } from "@/lib/prisma";
import { buildKitchenTicketDocument } from "@/lib/printing/kitchen-ticket";
import { KitchenTicketPrintView } from "@/components/admin/orders/KitchenTicketPrintView";
import type { Lang } from "@/lib/i18n/lang";

export default async function OrderTicketPrintPage({ params }: { params: Promise<{ id: string }> }) {
  // STAFF and up — the same audience the board itself is scoped to. This
  // page is the fallback for a dead agent or a restaurant that hasn't
  // installed one yet, so it needs to be reachable by whoever is already
  // working the board, not just an admin.
  await requirePageRole("/admin/login", UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const { id } = await params;
  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).orders;

  const order = await prisma.order.findFirst({
    where: { id, businessId: business.id },
    include: { table: true, items: { include: { modifiers: true } } },
  });
  if (!order) notFound();

  const ticketLang: Lang = order.locale === "en" ? "en" : "es";

  const document = buildKitchenTicketDocument({
    orderNumber: order.orderNumber,
    tableLabel: order.table?.code ?? null,
    guestCount: order.guestCount,
    placedAt: order.placedAt,
    timezone: business.timezone,
    lang: ticketLang,
    orderNote: order.notes,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      name: item.nameSnapshot,
      notes: item.notes,
      modifiers: item.modifiers.map((m) => m.nameSnapshot),
    })),
  });

  return (
    <div className="p-lg">
      <h1 className="mb-lg font-display text-[22px] font-semibold text-on-surface print:hidden">
        {dict.printPageTitle.replace("{orderNumber}", order.orderNumber)}
      </h1>
      <KitchenTicketPrintView document={document} printLabel={dict.printButton} />
    </div>
  );
}
