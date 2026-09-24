import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBusiness } from "@/lib/business";
import { getTableByQrToken } from "@/lib/tables/queries";
import { getMenuPageData } from "@/lib/menu/page-data";
import { MenuBrowser } from "@/components/order/MenuBrowser";
import { TableCookieBootstrap } from "@/components/order/TableCookieBootstrap";

// A capacity token — see app/o/[publicToken]/page.tsx's own metadata comment.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TablePage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const business = await getPublicBusiness();
  const table = await getTableByQrToken(business.id, qrToken);

  if (!table) {
    notFound();
  }

  const { lang, dict, cart, menu } = await getMenuPageData(table);

  return (
    <>
      <TableCookieBootstrap tableId={table.id} />
      <MenuBrowser
        categories={menu.categories}
        dishes={menu.dishes}
        cart={cart}
        dict={dict}
        lang={lang}
        currency={business.currency}
        tableLabel={table.code}
      />
    </>
  );
}
