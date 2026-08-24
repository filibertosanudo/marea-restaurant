import "server-only";
import { getCurrentBusiness } from "@/lib/business";
import { getPublicMenuRaw } from "@/lib/menu/queries";
import { toPublicMenuByLang } from "@/lib/menu/public-menu";
import { getCartWithLivePrices } from "@/lib/cart/queries";
import { getTableIdFromCookie } from "@/lib/cart/cookie";
import { getTableById } from "@/lib/tables/queries";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getOrderDictionary } from "@/lib/i18n/dictionaries";
import type { RestaurantTable } from "@/lib/generated/prisma/client";

/**
 * Shared by /menu and /t/[qrToken] — both render the exact same ordering
 * UI, differing only in how the table is known: /menu reads it from the
 * `marea-table` cookie (or has none, for takeaway); /t/[qrToken] already
 * resolved the table row from the URL (to give an honest 404 before this
 * even runs) and passes it straight through — no second lookup by id, and
 * nothing here needs to wait on it, so it stays out of the awaited batch.
 */
export async function getMenuPageData(explicitTable?: RestaurantTable | null) {
  const business = await getCurrentBusiness();
  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const dict = getOrderDictionary(lang);

  const [categories, cart, table] = await Promise.all([
    getPublicMenuRaw(business.id),
    getCartWithLivePrices(business.id, lang),
    explicitTable !== undefined ? Promise.resolve(explicitTable) : resolveTableFromCookie(business.id),
  ]);

  const menu = toPublicMenuByLang(categories)[lang];

  return { business, lang, dict, cart, menu, table };
}

async function resolveTableFromCookie(businessId: string): Promise<RestaurantTable | null> {
  const tableId = await getTableIdFromCookie();
  return tableId ? getTableById(businessId, tableId) : null;
}
