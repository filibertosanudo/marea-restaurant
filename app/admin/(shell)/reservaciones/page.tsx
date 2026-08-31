import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localWallClockToUtc, businessLocalDateParts } from "@/lib/reservations/availability";
import { getAgendaReservationsRaw, getReservableTablesForAgenda } from "@/lib/reservations/queries";
import { toAgendaReservationDTO, summarizeAgenda } from "@/lib/reservations/dto";
import { dateParamSchema, parseDateParam } from "@/lib/reservations/schemas";
import { ReservationsAgenda } from "@/components/admin/reservations/ReservationsAgenda";

type SearchParams = { date?: string };

function formatDateParam(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Pure calendar-day arithmetic, not a timezone conversion — walking to the adjacent date doesn't need to know the business's zone, only the abstract calendar. */
function adjacentDateParam(date: string, deltaDays: number): string {
  const { year, month, day } = parseDateParam(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

export default async function ReservationsAgendaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageRole(
    "/admin/login",
    UserRole.STAFF,
    UserRole.BUSINESS_ADMIN,
    UserRole.SUPER_ADMIN
  );
  const canCancel = isAdminRole(session.user.role);

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).reservations;

  const params = await searchParams;
  // dateParamSchema (shared with the public booking flow) rejects a
  // calendar date that doesn't exist, e.g. "2026-02-30" — a plain regex
  // wouldn't, and localWallClockToUtc would silently roll it into March.
  const parsedDate = params.date ? dateParamSchema.safeParse(params.date) : undefined;
  const dateParam = parsedDate?.success ? parsedDate.data : formatDateParam(businessLocalDateParts(new Date(), business.timezone));
  const { year, month, day } = parseDateParam(dateParam);

  const dayStart = localWallClockToUtc(year, month, day, 0, business.timezone);

  const [rawReservations, tables] = await Promise.all([
    getAgendaReservationsRaw(business.id, dayStart),
    getReservableTablesForAgenda(business.id),
  ]);

  const now = new Date();
  const reservations = rawReservations.map((r) => toAgendaReservationDTO(r, business.timezone, lang, now));
  const summary = summarizeAgenda(reservations);

  const dateLabel = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    timeZone: business.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dayStart);

  return (
    <ReservationsAgenda
      dict={dict}
      dateLabel={dateLabel}
      prevDateParam={adjacentDateParam(dateParam, -1)}
      nextDateParam={adjacentDateParam(dateParam, 1)}
      reservations={reservations}
      summary={summary}
      tables={tables}
      canCancel={canCancel}
    />
  );
}
