import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getOpeningHours } from "@/lib/reservations/queries";
import { getBusinessClosuresForAdmin } from "@/lib/settings/queries";
import { SettingsShell } from "@/components/admin/settings/SettingsShell";

export default async function SettingsPage() {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).settings;

  const [openingHours, closures] = await Promise.all([
    getOpeningHours(business.id),
    getBusinessClosuresForAdmin(business.id),
  ]);

  return (
    <SettingsShell
      dict={dict}
      lang={lang}
      timezone={business.timezone}
      openingHours={openingHours}
      closures={closures.map((c) => ({
        id: c.id,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        reason: c.reason,
      }))}
      business={{
        defaultLocale: business.defaultLocale,
        currency: business.currency,
        timezone: business.timezone,
        defaultReservationMinutes: business.defaultReservationMinutes,
        maxPartySize: business.maxPartySize,
        acceptsOnlinePayment: business.acceptsOnlinePayment,
        minBookingLeadMinutes: business.minBookingLeadMinutes,
        minCancelLeadMinutes: business.minCancelLeadMinutes,
      }}
    />
  );
}
