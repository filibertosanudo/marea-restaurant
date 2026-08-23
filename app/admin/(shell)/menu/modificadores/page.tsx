import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listModifierGroupsRaw } from "@/lib/menu/queries";
import { toModifierGroupDTO } from "@/lib/dto/menu";
import { MenuSectionTabs } from "@/components/admin/menu/MenuSectionTabs";
import { ModifierGroupList } from "@/components/admin/menu/ModifierGroupList";
import type { Lang } from "@/lib/i18n/lang";

export default async function ModifiersPage() {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);
  const groups = await listModifierGroupsRaw(business.id);

  return (
    <div className="flex h-full flex-col">
      <MenuSectionTabs active="modifiers" dict={dict} />
      <ModifierGroupList
        groups={groups.map((g) => toModifierGroupDTO(g, lang))}
        dict={dict}
        defaultLocale={business.defaultLocale as Lang}
      />
    </div>
  );
}
