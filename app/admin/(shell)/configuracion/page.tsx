import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest, getBusinessTranslations } from "@/lib/business";
import { onlinePaymentAvailability } from "@/lib/payments/availability";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getOpeningHours } from "@/lib/reservations/queries";
import { getBusinessClosuresForAdmin } from "@/lib/settings/queries";
import type { BusinessContent } from "@/components/admin/settings/BusinessContentForm";
import { SettingsShell } from "@/components/admin/settings/SettingsShell";
import { listRecentNotificationJobs, countDueNotificationJobs } from "@/lib/notifications/queries";
import { toNotificationJobDTO } from "@/lib/notifications/dto";
import { listDevicesForAdmin } from "@/lib/devices/queries";
import { toDeviceDTO } from "@/lib/devices/dto";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const [business, lang] = await Promise.all([getBusinessForRequest(), getAdminLang()]);
  const availability = await onlinePaymentAvailability(business);
  const onlinePaymentAllowed = availability.allowed;
  // Nothing in the address names a business or an account: it only says whether
  // the administrator is arriving from Stripe. The card acts on the session's business.
  const { stripe: arrivalParam } = await searchParams;
  const arrival = arrivalParam === "return" || arrivalParam === "refresh" ? arrivalParam : null;
  const dict = getDictionary(lang).settings;

  const [openingHours, closures, translations, notificationJobs, notificationsDueCount, devices] = await Promise.all([
    getOpeningHours(business.id),
    getBusinessClosuresForAdmin(business.id),
    getBusinessTranslations(business.id),
    listRecentNotificationJobs(business.id),
    countDueNotificationJobs(business.id),
    listDevicesForAdmin(business.id),
  ]);

  const content: BusinessContent = {
    en: { tagline: "", shortBlurb: "", aboutTitle: "", aboutBody: "" },
    es: { tagline: "", shortBlurb: "", aboutTitle: "", aboutBody: "" },
  };
  for (const t of translations) {
    if (t.locale === "en" || t.locale === "es") {
      content[t.locale] = {
        tagline: t.tagline ?? "",
        shortBlurb: t.shortBlurb ?? "",
        aboutTitle: t.aboutTitle ?? "",
        aboutBody: t.aboutBody ?? "",
      };
    }
  }

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
        acceptsOnlinePayment: business.acceptsOnlinePayment && onlinePaymentAllowed,
        onlinePaymentAllowed,
        onlinePaymentReason: availability.allowed ? null : availability.reason,
        country: business.country,
        minBookingLeadMinutes: business.minBookingLeadMinutes,
        minCancelLeadMinutes: business.minCancelLeadMinutes,
        addressLine1: business.addressLine1,
        addressLine2: business.addressLine2,
        city: business.city,
        phone: business.phone,
        email: business.email,
      }}
      content={content}
      notificationsDueCount={notificationsDueCount}
      notificationJobs={notificationJobs.map(toNotificationJobDTO)}
      devices={devices.map(toDeviceDTO)}
      stripe={{
        hasCountry: business.country !== null,
        hasAccount: business.stripeAccountId !== null,
        status: business.stripeCardPaymentsStatus,
        checkedAt: business.stripeStatusCheckedAt?.toISOString() ?? null,
        arrival,
      }}
    />
  );
}
