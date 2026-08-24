import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listCategoriesRaw } from "@/lib/menu/queries";
import { toCategoryListDTO } from "@/lib/dto/menu";
import { MenuSectionTabs } from "@/components/admin/menu/MenuSectionTabs";
import { CategoryList } from "@/components/admin/menu/CategoryList";
import type { Lang } from "@/lib/i18n/lang";

export default async function CategoriesPage() {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);
  const categories = await listCategoriesRaw(business.id);

  return (
    <div className="flex h-full flex-col">
      <MenuSectionTabs active="categories" dict={dict} />
      <CategoryList
        categories={categories.map((c) => toCategoryListDTO(c, lang))}
        dict={dict}
        defaultLocale={business.defaultLocale as Lang}
      />
    </div>
  );
}
