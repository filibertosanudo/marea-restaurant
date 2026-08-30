"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AgendaReservationDTO, AgendaSummary } from "@/lib/reservations/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import {
  confirmReservationAction,
  seatReservationAction,
  completeReservationAction,
  markNoShowAction,
} from "@/lib/reservations/staff-actions";
import { CancelReservationDialog } from "./CancelReservationDialog";

type Table = { id: string; code: string; zone: string | null; seats: number };
type ReservationDict = AdminDictionary["reservations"];

const STATUS_LABEL_KEY = {
  PENDING: "statusPending",
  CONFIRMED: "statusConfirmed",
  SEATED: "statusSeated",
  COMPLETED: "statusCompleted",
  CANCELLED: "statusCancelled",
  NO_SHOW: "statusNoShow",
} as const satisfies Record<AgendaReservationDTO["status"], keyof ReservationDict>;

// Neutral for what needs no action yet (PENDING, CANCELLED), info for
// confirmed-but-not-here-yet, success for SEATED/COMPLETED alike (neither
// is a problem — the only difference is whether the table's been freed),
// warning for the one status that genuinely needs a human to notice it.
// Same mapping ReservationStatusBadge uses on the public lookup page.
const STATUS_STYLE: Record<AgendaReservationDTO["status"], string> = {
  PENDING: "bg-border/16 text-on-surface-muted",
  CONFIRMED: "bg-info/12 text-info",
  SEATED: "bg-success/12 text-success",
  COMPLETED: "bg-success/12 text-success",
  CANCELLED: "bg-border/16 text-on-surface-muted",
  NO_SHOW: "bg-warning/12 text-warning",
};

const DIMMED_STATUSES = new Set<AgendaReservationDTO["status"]>(["COMPLETED", "CANCELLED", "NO_SHOW"]);

function errorMessage(dict: ReservationDict, code: string | undefined): string | null {
  switch (code) {
    case undefined:
      return null;
    case "table_taken":
      return dict.errorTableTaken;
    case "table_too_small":
      return dict.errorTableTooSmall;
    case "table_not_found":
      return dict.errorTableNotFound;
    default:
      return dict.errorGeneric;
  }
}

function ReservationRow({
  reservation,
  dict,
  tables,
  canCancel,
  onCancel,
}: {
  reservation: AgendaReservationDTO;
  dict: ReservationDict;
  tables: Table[];
  canCancel: boolean;
  onCancel: (r: AgendaReservationDTO) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const [chosenTableId, setChosenTableId] = useState(reservation.tableId ?? "");

  function run(action: () => Promise<{ error?: string } | undefined>) {
    setRowError(null);
    startTransition(async () => {
      const result = await action();
      setRowError(errorMessage(dict, result?.error));
    });
  }

  const dimmed = DIMMED_STATUSES.has(reservation.status);

  return (
    <div
      className={`flex flex-col gap-[8px] rounded-sm border p-md ${
        reservation.isOverdue ? "border-warning/40 bg-warning/8" : "border-border/25 bg-surface"
      } ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-md">
        <span className="w-[64px] shrink-0 font-display text-[16px] font-bold tabular-nums text-on-surface">
          {reservation.timeLabel}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-on-surface">{reservation.guestName}</div>
          <div className="flex flex-wrap items-center gap-sm text-[12.5px] text-on-surface-muted">
            <span className="font-semibold text-on-surface">{reservation.partySize}×</span>
            {reservation.isOverdue && (
              <span className="font-semibold text-warning">{dict.overdueFlag}</span>
            )}
          </div>
        </div>

        {reservation.status === "PENDING" ? (
          <select
            value={chosenTableId}
            onChange={(e) => setChosenTableId(e.target.value)}
            disabled={pending}
            className="rounded-sm border border-border/40 bg-surface px-sm py-[6px] text-[12px] text-on-surface"
          >
            <option value="">{dict.tableUnassigned}</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.zone ? `${t.zone} · ${t.code}` : t.code} ({t.seats})
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-sm bg-surface-raised px-sm py-[3px] text-[12px] font-medium text-on-surface-muted">
            {reservation.tableLabel ?? dict.tableUnassigned}
          </span>
        )}

        <span className={`rounded-sm px-sm py-[3px] text-[12px] font-semibold ${STATUS_STYLE[reservation.status]}`}>
          {dict[STATUS_LABEL_KEY[reservation.status]]}
        </span>

        <div className="flex flex-wrap items-center gap-[6px]">
          {reservation.status === "PENDING" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmReservationAction(reservation.id, chosenTableId || undefined))}
              className="rounded-sm bg-primary px-md py-[7px] text-[12px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {dict.confirmAction}
            </button>
          )}
          {reservation.status === "CONFIRMED" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => seatReservationAction(reservation.id))}
                className="rounded-sm bg-primary px-md py-[7px] text-[12px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {dict.seatAction}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => markNoShowAction(reservation.id))}
                className="rounded-sm border border-warning/40 px-md py-[7px] text-[12px] font-semibold text-warning transition-colors hover:bg-warning/8 disabled:opacity-50"
              >
                {dict.noShowAction}
              </button>
            </>
          )}
          {reservation.status === "SEATED" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => completeReservationAction(reservation.id))}
              className="rounded-sm bg-primary px-md py-[7px] text-[12px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {dict.completeAction}
            </button>
          )}
          {canCancel && (reservation.status === "PENDING" || reservation.status === "CONFIRMED") && (
            <button
              type="button"
              onClick={() => onCancel(reservation)}
              className="px-sm py-[7px] text-[12px] font-medium text-error underline decoration-error/40 underline-offset-2"
            >
              {dict.cancelAction}
            </button>
          )}
        </div>
      </div>

      {reservation.notes && (
        <p className="text-[12px] text-on-surface-muted">
          {dict.notesLabel}: {reservation.notes}
        </p>
      )}
      {rowError && <p className="text-[12px] font-medium text-error">{rowError}</p>}
    </div>
  );
}

export function ReservationsAgenda({
  dict,
  dateLabel,
  prevDateParam,
  nextDateParam,
  reservations,
  summary,
  tables,
  canCancel,
}: {
  dict: ReservationDict;
  dateLabel: string;
  prevDateParam: string;
  nextDateParam: string;
  reservations: AgendaReservationDTO[];
  summary: AgendaSummary;
  tables: Table[];
  canCancel: boolean;
}) {
  const [cancelTarget, setCancelTarget] = useState<AgendaReservationDTO | null>(null);

  const groups: { hourLabel: string; rows: AgendaReservationDTO[] }[] = [];
  for (const r of reservations) {
    const last = groups[groups.length - 1];
    if (last && last.hourLabel === r.hourLabel) last.rows.push(r);
    else groups.push({ hourLabel: r.hourLabel, rows: [r] });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center justify-between gap-md border-b border-border/25 bg-surface px-lg py-md">
        <div className="flex flex-wrap items-center gap-md">
          <h1 className="font-display text-[24px] font-semibold text-on-surface md:text-[26px]">{dict.title}</h1>
          <div className="flex items-center gap-sm">
            <Link
              href={`/admin/reservaciones?date=${prevDateParam}`}
              aria-label={dict.prevDay}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border/35 text-on-surface-muted hover:bg-surface-subtle"
            >
              ‹
            </Link>
            <span className="font-display text-[15px] font-semibold text-on-surface">{dateLabel}</span>
            <Link
              href={`/admin/reservaciones?date=${nextDateParam}`}
              aria-label={dict.nextDay}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border/35 text-on-surface-muted hover:bg-surface-subtle"
            >
              ›
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-lg">
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold tabular-nums text-on-surface">{summary.total}</span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
              {dict.todayCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold tabular-nums text-on-surface-muted">
              {summary.pending}
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
              {dict.pendingCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold tabular-nums text-success">{summary.seated}</span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
              {dict.seatedCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-bold tabular-nums text-warning">{summary.overdue}</span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
              {dict.overdueCount}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-lg">
        {reservations.length === 0 ? (
          <div className="mx-auto flex max-w-[420px] flex-col items-center gap-sm rounded-lg bg-surface-subtle p-3xl text-center">
            <h3 className="font-display text-[17px] font-semibold text-on-surface">{dict.emptyTitle}</h3>
            <p className="text-[13px] text-on-surface-muted">{dict.emptyBody}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-lg">
            {groups.map((group) => (
              <div key={group.hourLabel} className="flex gap-md">
                <div className="w-[56px] shrink-0 pt-md text-[12.5px] font-semibold text-on-surface-muted">
                  {group.hourLabel}
                </div>
                <div className="flex flex-1 flex-col gap-sm border-t border-border/15 pt-md">
                  {group.rows.map((r) => (
                    <ReservationRow
                      key={r.id}
                      reservation={r}
                      dict={dict}
                      tables={tables}
                      canCancel={canCancel}
                      onCancel={setCancelTarget}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CancelReservationDialog reservation={cancelTarget} dict={dict} onClose={() => setCancelTarget(null)} />
    </div>
  );
}
