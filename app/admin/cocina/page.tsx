import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { countBoardOrdersRaw, listBoardPageRaw } from "@/lib/orders/queries";
import { KITCHEN_COLUMNS } from "@/lib/orders/state-machine";
import { toBoardOrderDTO } from "@/lib/orders/dto";
import { getActivePrinterStatus } from "@/lib/devices/queries";
import { KitchenBoard } from "@/components/admin/kitchen/KitchenBoard";

// Outside the (shell) route group on purpose — see app/admin/(shell)/layout.tsx.
// A device that logs in once and stays for months gets no sidebar, no
// header, no navigation: adding either is what turns a kitchen screen into
// just another admin tab, per the module's own rule.
export default async function KitchenScreenPage() {
  await requirePageRole("/admin/login", UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);

  // The first page of each column (50 cards) and every column's total: a
  // kitchen with more pending than that has a problem scrolling does not solve,
  // so the rest waits behind "ver más".
  const [pages, totals, printer] = await Promise.all([
    Promise.all(KITCHEN_COLUMNS.map((status) => listBoardPageRaw(business.id, status))),
    countBoardOrdersRaw(business.id),
    getActivePrinterStatus(business.id),
  ]);

  return (
    <KitchenBoard
      orders={pages.flatMap((page) => page.orders).map(toBoardOrderDTO)}
      totals={totals}
      dict={dict.kitchen}
      printerLastSeenAt={printer?.lastSeenAt?.toISOString() ?? null}
    />
  );
}
