import { notFound } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getTableByQrToken } from "@/lib/tables/queries";
import { getMenuPageData } from "@/lib/menu/page-data";
import { MenuBrowser } from "@/components/order/MenuBrowser";
import { TableCookieBootstrap } from "@/components/order/TableCookieBootstrap";

export default async function TablePage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const business = await getCurrentBusiness();
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
