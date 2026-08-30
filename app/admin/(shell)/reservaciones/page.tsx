import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localWallClockToUtc } from "@/lib/reservations/availability";
import { getAgendaReservationsRaw, getReservableTablesForAgenda } from "@/lib/reservations/queries";
import { toAgendaReservationDTO, summarizeAgenda } from "@/lib/reservations/dto";
import { ReservationsAgenda } from "@/components/admin/reservations/ReservationsAgenda";

type SearchParams = { date?: string };

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** "Today" in the business's own timezone — never the server process's or a browser's local date. */
function currentBusinessDateParam(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Pure calendar-day arithmetic, not a timezone conversion — walking to the adjacent date doesn't need to know the business's zone, only the abstract calendar. */
function adjacentDateParam(date: string, deltaDays: number): string {
  const { year, month, day } = parseDateParts(date);
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
  const dateParam = params.date && DATE_PARAM_RE.test(params.date) ? params.date : currentBusinessDateParam(business.timezone);
  const { year, month, day } = parseDateParts(dateParam);

  const dayStart = localWallClockToUtc(year, month, day, 0, business.timezone);
  const dayEnd = localWallClockToUtc(year, month, day, 1440, business.timezone);

  const [rawReservations, tables] = await Promise.all([
    getAgendaReservationsRaw(business.id, dayStart, dayEnd),
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
