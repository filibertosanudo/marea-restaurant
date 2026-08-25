import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  listBoardOrdersRaw,
  listCancelledOrdersRaw,
  listActiveTablesRaw,
} from "@/lib/orders/queries";
import { toBoardOrderDTO } from "@/lib/orders/dto";
import { OrdersBoard } from "@/components/admin/OrdersBoard";
import type { OrderType } from "@/lib/generated/prisma/client";

type SearchParams = { type?: string; table?: string; tab?: string };

function parseOrderType(value: string | undefined): OrderType | undefined {
  return value === "DINE_IN" || value === "TAKEAWAY" ? value : undefined;
}

export default async function OrdersBoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageRole(
    "/admin/login",
    UserRole.STAFF,
    UserRole.BUSINESS_ADMIN,
    UserRole.SUPER_ADMIN
  );
  const canCancel = session.user.role !== UserRole.STAFF;
  // Same threshold as canCancel today (both are BUSINESS_ADMIN+ per the
  // permission matrix) — kept as its own variable since they're two
  // independently-named permissions ("Cancelar un pedido" and
  // "Reembolsar") that happen to share a role, not the same rule.
  const canRefund = session.user.role !== UserRole.STAFF;

  const params = await searchParams;
  const tab = params.tab === "cancelled" ? "cancelled" : "board";
  const filters = { orderType: parseOrderType(params.type), tableId: params.table || undefined };

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);

  const [boardOrders, cancelledOrders, tables] = await Promise.all([
    tab === "board" ? listBoardOrdersRaw(business.id, filters) : Promise.resolve([]),
    tab === "cancelled" ? listCancelledOrdersRaw(business.id, filters) : Promise.resolve([]),
    listActiveTablesRaw(business.id),
  ]);

  return (
    <OrdersBoard
      boardOrders={boardOrders.map(toBoardOrderDTO)}
      cancelledOrders={cancelledOrders.map(toBoardOrderDTO)}
      tables={tables}
      dict={dict.orders}
      paymentsDict={dict.payments}
      lang={lang}
      canCancel={canCancel}
      canRefund={canRefund}
      tab={tab}
    />
  );
}
