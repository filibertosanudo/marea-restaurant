import { notFound } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getCashSessionDetailRaw, getCashSessionActivityRaw } from "@/lib/cash-register/queries";
import { toCashSessionDetailDTO, toCashSessionActivityDTO } from "@/lib/dto/cash-register";
import { CashSessionReceipt } from "@/components/admin/cash-register/CashSessionReceipt";
import { prisma } from "@/lib/prisma";
import "@/components/admin/cash-register/cash-session-receipt.css";

export default async function CashSessionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  // Any STAFF+ can view/print the receipt of a shift — the cashier who just
  // closed their own turno needs this immediately, per the module's own
  // flow. Only the aggregate history table (the reportes "cortes" tab) is
  // BUSINESS_ADMIN+, since reading the pattern of mismatches over time is
  // the owner's job, not the cashier's.
  await requirePageRole("/admin/login", UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const { id } = await params;
  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).cashRegister;

  const raw = await getCashSessionDetailRaw(business.id, id);
  if (!raw || !raw.closedAt) notFound();

  const activity = await getCashSessionActivityRaw(prisma, raw.id);

  return (
    <div className="p-lg">
      <CashSessionReceipt
        session={toCashSessionDetailDTO(raw)}
        activity={toCashSessionActivityDTO(raw.openingFloat, activity)}
        currency={business.currency}
        lang={lang}
        dict={dict}
      />
    </div>
  );
}
