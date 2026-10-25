import { getMenuPageData } from "@/lib/menu/page-data";
import { degradeStateFor } from "@/lib/billing/degrade-guard";
import { PausedPage } from "@/components/public/PausedPage";
import { MenuBrowser } from "@/components/order/MenuBrowser";

export default async function MenuPage() {
  const { business, lang, dict, cart, menu, table } = await getMenuPageData();
  if ((await degradeStateFor(business.id)).level === "SUSPENDED") return <PausedPage name={business.name} phone={business.phone} />;


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
