import { notFound, redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";
import { onlinePaymentAvailability } from "@/lib/payments/availability";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getOpeningHours } from "@/lib/reservations/queries";
import { getBusinessClosuresForAdmin } from "@/lib/settings/queries";
import type { Lang } from "@/lib/i18n/lang";
import { BusinessDataStep } from "@/components/admin/onboarding/BusinessDataStep";
import { HoursStep } from "@/components/admin/onboarding/HoursStep";
import { TablesStep } from "@/components/admin/onboarding/TablesStep";
import { MenuStep } from "@/components/admin/onboarding/MenuStep";

/**
 * Resumes at the business's own onboardingStep, not whatever a URL guessed
 * or an earlier bookmark said — visiting a step ahead of it redirects back;
 * visiting one already passed is allowed, to go back and edit it.
 */
export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  await requirePageRole("/admin/login", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);
  const { step: stepParam } = await params;
  const step = Number(stepParam);
  if (!Number.isInteger(step) || step < 1 || step > 4) notFound();

  const business = await getBusinessForRequest();
  if (business.onboardingCompletedAt) redirect("/admin");
  if (step > business.onboardingStep) redirect(`/admin/asistente/${business.onboardingStep}`);

  const lang = await getAdminLang();
  const dict = getDictionary(lang);

  if (step === 1) {
    const availability = await onlinePaymentAvailability(business);
    return (
      <BusinessDataStep
        dict={dict}
        business={{
          defaultLocale: business.defaultLocale,
          currency: business.currency,
          timezone: business.timezone,
          defaultReservationMinutes: business.defaultReservationMinutes,
          maxPartySize: business.maxPartySize,
          acceptsOnlinePayment: business.acceptsOnlinePayment && availability.allowed,
          onlinePaymentAllowed: availability.allowed,
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
      />
    );
  }

  if (step === 2) {
    const [openingHours, closures] = await Promise.all([
      getOpeningHours(business.id),
      getBusinessClosuresForAdmin(business.id),
    ]);
    return (
      <HoursStep
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
      />
    );
  }

  if (step === 3) {
    return <TablesStep dict={dict} />;
  }

  return <MenuStep dict={dict} defaultLocale={business.defaultLocale as Lang} />;
}
