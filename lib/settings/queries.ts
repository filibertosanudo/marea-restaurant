import "server-only";
import { prisma } from "@/lib/prisma";

/** Every closure row for the admin list — unlike getBusinessClosures (reservations' read-only view, id/reason-less by design), this needs both so the screen can label and delete a specific row. */
export async function getBusinessClosuresForAdmin(businessId: string) {
  return prisma.businessClosure.findMany({
    where: { businessId },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true, reason: true },
  });
}

/** Both locales' rows (or fewer, if a locale was never filled in) — the content editor always shows both language tabs regardless of what exists yet. */
export async function getBusinessTranslationsForAdmin(businessId: string) {
  return prisma.businessTranslation.findMany({
    where: { businessId },
    select: { locale: true, tagline: true, shortBlurb: true, aboutTitle: true, aboutBody: true },
  });
}
