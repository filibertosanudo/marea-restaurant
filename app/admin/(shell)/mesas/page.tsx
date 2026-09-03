import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getTablesForAdmin } from "@/lib/tables/queries";
import { TablesManager } from "@/components/admin/tables/TablesManager";

export default async function TablesPage() {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).tables;
  const tables = await getTablesForAdmin(business.id);

  return (
    <TablesManager
      dict={dict}
      lang={lang}
      tables={tables.map((t) => ({
        id: t.id,
        code: t.code,
        zone: t.zone,
        seats: t.seats,
        isActive: t.isActive,
        status: t.status,
        qrRotatedAt: t.qrRotatedAt ? t.qrRotatedAt.toISOString() : null,
      }))}
    />
  );
}
