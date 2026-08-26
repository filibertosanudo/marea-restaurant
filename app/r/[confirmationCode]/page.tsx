import { notFound } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getReservationByConfirmationCode } from "@/lib/reservations/queries";
import { toReservationLookupDTO } from "@/lib/reservations/dto";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getReservationDictionary } from "@/lib/i18n/dictionaries";
import { CancelReservationButton } from "@/components/reservation/CancelReservationButton";
import type { ReservationDictionary } from "@/lib/i18n/dictionaries";
import type { ReservationStatus } from "@/lib/generated/prisma/client";

const STATUS_LABEL_KEY: Record<ReservationStatus, keyof ReservationDictionary> = {
  PENDING: "statusPending",
  CONFIRMED: "statusConfirmed",
  SEATED: "statusSeated",
  COMPLETED: "statusCompleted",
  CANCELLED: "statusCancelled",
  NO_SHOW: "statusNoShow",
};

export default async function ReservationLookupPage({
  params,
}: {
  params: Promise<{ confirmationCode: string }>;
}) {
  const { confirmationCode } = await params;
  const business = await getCurrentBusiness();
  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const dict = getReservationDictionary(lang);

  const raw = await getReservationByConfirmationCode(business.id, confirmationCode);
  if (!raw) notFound();

  const reservation = toReservationLookupDTO(raw, business.timezone, lang, new Date());
  const partyLabel = (reservation.partySize === 1 ? dict.partySizeOne : dict.partySizeOther).replace(
    "{n}",
    String(reservation.partySize)
  );

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-subtle px-lg pb-lg pt-[40px] text-center">
      <div className="mb-[36px] flex items-center gap-[7px] opacity-70">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary font-display text-[10px] font-bold text-on-primary">
          M
        </span>
        <span className="font-display text-[12px] font-semibold tracking-wide text-on-surface">
          {dict.brand.toUpperCase()}
        </span>
      </div>

      <p className="mb-[6px] text-[11.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
        {dict.title}
      </p>
      <h1 className="mb-lg text-balance font-display text-[28px] font-bold text-on-surface">
        {reservation.reservedForLabel}
      </h1>

      <div className="w-full max-w-[380px] rounded-lg bg-surface p-lg text-left">
        <div className="mb-sm flex items-center justify-between">
          <span className="text-[15px] font-semibold text-on-surface">{reservation.guestName}</span>
          <span className="rounded-sm bg-surface-ocean px-sm py-[3px] text-[12px] font-semibold text-primary">
            {dict[STATUS_LABEL_KEY[reservation.status]]}
          </span>
        </div>
        <div className="flex flex-col gap-[4px] text-[13px] text-on-surface-muted">
          <span>{partyLabel}</span>
          <span>{reservation.tableLabel ?? dict.tableUnassigned}</span>
          {reservation.notes && (
            <span>
              {dict.notesLabel}: {reservation.notes}
            </span>
          )}
        </div>

        {reservation.status === "CANCELLED" && reservation.cancellationReason && (
          <p className="mt-sm text-[12.5px] text-on-surface-muted">
            {dict.cancellationReasonLabel}: {reservation.cancellationReason}
          </p>
        )}

        <div className="mt-md border-t border-border/20 pt-sm text-[11.5px] text-on-surface-muted">
          {dict.codeLabel}: <span className="font-semibold tabular-nums">{reservation.confirmationCode}</span>
        </div>
      </div>

      {reservation.canCancel && (
        <div className="mt-lg">
          <CancelReservationButton
            confirmationCode={reservation.confirmationCode}
            dict={{
              cancelButton: dict.cancelButton,
              cancelConfirmTitle: dict.cancelConfirmTitle,
              cancelConfirmBody: dict.cancelConfirmBody,
              cancelConfirmYes: dict.cancelConfirmYes,
              cancelConfirmNo: dict.cancelConfirmNo,
              cancelTooLateError: dict.cancelTooLateError,
              cancelGenericError: dict.cancelGenericError,
            }}
          />
        </div>
      )}
    </div>
  );
}
