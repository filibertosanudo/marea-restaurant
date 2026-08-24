import { getMenuPageData } from "@/lib/menu/page-data";
import { MenuBrowser } from "@/components/order/MenuBrowser";

export default async function MenuPage() {
  const { business, lang, dict, cart, menu, table } = await getMenuPageData();

  return (
    <MenuBrowser
      categories={menu.categories}
      dishes={menu.dishes}
      cart={cart}
      dict={dict}
      lang={lang}
      currency={business.currency}
      tableLabel={table ? table.code : null}
    />
  );
}
