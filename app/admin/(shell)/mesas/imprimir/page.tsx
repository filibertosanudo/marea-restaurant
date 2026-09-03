import QRCode from "qrcode";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { appOrigin } from "@/lib/env";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getTablesForAdmin } from "@/lib/tables/queries";
import { QrSheet } from "@/components/admin/tables/QrSheet";
import "@/components/admin/tables/qr-sheet.css";

export default async function TablesPrintPage() {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).tables;
  const tables = (await getTablesForAdmin(business.id)).filter((t) => t.isActive);

  const origin = appOrigin();
  const withQr = await Promise.all(
    tables.map(async (t) => ({
      id: t.id,
      code: t.code,
      zone: t.zone,
      qrSvg: await QRCode.toString(`${origin}/t/${t.qrToken}`, { type: "svg", margin: 1, width: 240 }),
    }))
  );

  return (
    <div className="p-lg">
      <h1 className="mb-[2px] font-display text-[22px] font-semibold text-on-surface">{dict.printPageTitle}</h1>
      <p className="mb-lg text-[12.5px] text-on-surface-muted">{dict.printLead}</p>
      <QrSheet tables={withQr} dict={dict} />
    </div>
  );
}
