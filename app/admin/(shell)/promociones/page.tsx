import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listPromotionsRaw } from "@/lib/promotions/queries";
import { listMenuItemNamesRaw } from "@/lib/menu/queries";
import { toPromotionListDTO } from "@/lib/dto/promotions";
import { getPromotionStatus } from "@/lib/promotions/status";
import { pickTranslation } from "@/lib/i18n/translations";
import { PromotionTable } from "@/components/admin/promotions/PromotionTable";
import type { Lang } from "@/lib/i18n/lang";

export default async function PromotionsPage() {
  await requirePageRole("/admin/login", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);

  const [promotions, menuItems] = await Promise.all([
    listPromotionsRaw(business.id),
    listMenuItemNamesRaw(business.id),
  ]);

  const now = new Date();
  const rows = promotions.map((promo) => ({
    ...toPromotionListDTO(promo, lang),
    status: getPromotionStatus(promo, now),
  }));

  return (
    <PromotionTable
      promotions={rows}
      menuItems={menuItems.map((item) => ({
        id: item.id,
        name: pickTranslation(item.translations, lang)?.name ?? item.id,
      }))}
      dict={dict}
      defaultLocale={business.defaultLocale as Lang}
      lang={lang}
    />
  );
}
