"use client";

import { useActionState, useState, useTransition } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { toIntlLocale } from "@/lib/dto/money";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  updateOpeningHoursAction,
  createClosureAction,
  deleteClosureAction,
  type SettingsFormState,
} from "@/lib/settings/actions";
import { normalizeBlock, formatMinutesToTime, type DayScheduleInput } from "@/lib/settings/schedule";

type SettingsDict = AdminDictionary["settings"];

export type OpeningHourRow = { dayOfWeek: number; opensAt: number; closesAt: number; isClosed: boolean };
export type ClosureRow = { id: string; startsAt: string; endsAt: string; reason: string | null };

const timeInputClass =
  "w-[92px] rounded-sm border border-border bg-surface px-[10px] py-[6px] text-[12.5px] text-on-surface outline-none focus:border-primary";

function buildInitialDays(openingHours: OpeningHourRow[]): DayScheduleInput[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const rows = openingHours.filter((h) => h.dayOfWeek === dayOfWeek && !h.isClosed);
    return {
      dayOfWeek,
      isOpen: rows.length > 0,
      blocks: rows.map((r) => ({ opensAt: formatMinutesToTime(r.opensAt), closesAt: formatMinutesToTime(r.closesAt) })),
    };
  });
}

function dayErrorText(dict: SettingsDict, code: string | undefined): string | null {
  switch (code) {
    case "empty_block":
      return dict.errorEmptyBlock;
    case "invalid_time":
      return dict.errorInvalidTime;
    case "overlap":
      return dict.errorOverlap;
    default:
      return null;
  }
}

/**
 * Formatted against the business's own timezone and an explicit locale —
 * never the admin browser's default of either. A closure stored as a UTC
 * instant means one specific wall-clock moment in business time; reading
 * it back through whatever zone the admin's OS happens to be set to would
 * show the wrong calendar day for anyone outside that zone, and an
 * unspecified locale risks a server/client mismatch the same way an
 * earlier admin screen's unlocalized toLocaleString() once did.
 */
function formatClosureRange(startsAt: string, endsAt: string, timezone: string, lang: Lang): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const locale = toIntlLocale(lang);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(start);
  const spansFullDay = end.getTime() - start.getTime() >= 23 * 60 * 60 * 1000;
  if (spansFullDay) return dateLabel;
  const timeFmt = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export function ScheduleEditor({
  dict,
  lang,
  timezone,
  openingHours,
  closures,
}: {
  dict: SettingsDict;
  lang: Lang;
  timezone: string;
  openingHours: OpeningHourRow[];
  closures: ClosureRow[];
}) {
  const [days, setDays] = useState<DayScheduleInput[]>(() => buildInitialDays(openingHours));
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  const [closureState, closureFormAction, closurePending] = useActionState<SettingsFormState, FormData>(
    createClosureAction,
    undefined
  );
  const [allDay, setAllDay] = useState(true);

  function updateDay(dayOfWeek: number, patch: Partial<DayScheduleInput>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  function updateBlock(dayOfWeek: number, index: number, patch: Partial<{ opensAt: string; closesAt: string }>) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, blocks: d.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
          : d
      )
    );
    setSaved(false);
  }

  function addBlock(dayOfWeek: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek && d.blocks.length < 2
          ? { ...d, blocks: [...d.blocks, { opensAt: "12:00", closesAt: "21:00" }] }
          : d
      )
    );
  }

  function removeBlock(dayOfWeek: number, index: number) {
    setDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, blocks: d.blocks.filter((_, i) => i !== index) } : d))
    );
    setSaved(false);
  }

  function handleSaveHours() {
    startSaving(async () => {
      const result = await updateOpeningHoursAction(days);
      if ("error" in result) {
        setDayErrors(result.dayErrors);
        setSaved(false);
      } else {
        setDayErrors({});
        setSaved(true);
      }
    });
  }

  const [closureDeleteTarget, setClosureDeleteTarget] = useState<ClosureRow | null>(null);
  const [closureDeletePending, setClosureDeletePending] = useState(false);

  async function handleConfirmDeleteClosure() {
    if (!closureDeleteTarget) return;
    setClosureDeletePending(true);
    await deleteClosureAction(closureDeleteTarget.id);
    setClosureDeletePending(false);
    setClosureDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-md rounded-md border border-surface-ocean-border bg-surface-ocean p-md text-[12px] text-on-surface">
        {dict.hoursLead}
      </div>

      <div className="mb-lg overflow-hidden rounded-md border border-border bg-surface">
        {days.map((day, index) => (
          <div
            key={day.dayOfWeek}
            className={`flex flex-wrap items-start gap-md px-md py-[12px] ${
              index !== days.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div className="w-[100px] shrink-0 pt-[6px] text-[13px] font-medium text-on-surface">
              {dict.dayNames[day.dayOfWeek]}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={day.isOpen}
              onClick={() => updateDay(day.dayOfWeek, { isOpen: !day.isOpen })}
              className={`relative mt-[6px] h-[20px] w-[34px] shrink-0 rounded-full transition-colors ${
                day.isOpen ? "bg-success" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-surface transition-transform ${
                  day.isOpen ? "translate-x-[16px]" : "translate-x-[2px]"
                }`}
              />
            </button>

            {!day.isOpen ? (
              <span className="pt-[6px] text-[12px] italic text-on-surface-muted">{dict.closedLabel}</span>
            ) : (
              <div className="flex flex-1 flex-col gap-[8px]">
                {day.blocks.map((block, blockIndex) => {
                  const normalized = normalizeBlock(block);
                  const afterMidnight = normalized !== null && normalized.closesAt > 1440;
                  return (
                    <div key={blockIndex} className="flex flex-wrap items-center gap-[8px]">
                      <input
                        type="time"
                        value={block.opensAt}
                        onChange={(e) => updateBlock(day.dayOfWeek, blockIndex, { opensAt: e.target.value })}
                        className={timeInputClass}
                      />
                      <span className="text-[12px] text-on-surface-muted">–</span>
                      <input
                        type="time"
                        value={block.closesAt}
                        onChange={(e) => updateBlock(day.dayOfWeek, blockIndex, { closesAt: e.target.value })}
                        className={timeInputClass}
                      />
                      {afterMidnight && (
                        <span className="text-[11px] text-info">
                          {dict.afterMidnightNote.replace("{time}", formatMinutesToTime(normalized.closesAt))}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeBlock(day.dayOfWeek, blockIndex)}
                        title={dict.removeBlock}
                        className="flex h-6 w-6 items-center justify-center rounded-sm text-on-surface-muted hover:bg-error/12 hover:text-error"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                {day.blocks.length < 2 && (
                  <button
                    type="button"
                    onClick={() => addBlock(day.dayOfWeek)}
                    className="w-fit text-[12px] font-medium text-primary"
                  >
                    {dict.addBlock}
                  </button>
                )}
                {dayErrorText(dict, dayErrors[day.dayOfWeek]) && (
                  <p className="text-[11.5px] text-error">{dayErrorText(dict, dayErrors[day.dayOfWeek])}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-2xl flex items-center justify-end gap-sm">
        {saved && <span className="text-[12px] text-success">{dict.saveHours} ✓</span>}
        <Button type="button" onClick={handleSaveHours} disabled={saving}>
          {dict.saveHours}
        </Button>
      </div>

      <div className="rounded-md border border-border bg-surface p-md">
        <h2 className="mb-[2px] text-[16px] font-semibold text-on-surface">{dict.closuresTitle}</h2>
        <p className="mb-md text-[12px] text-on-surface-muted">{dict.closuresLead}</p>

        {closures.length === 0 ? (
          <p className="mb-md text-[12.5px] text-on-surface-muted">{dict.noClosures}</p>
        ) : (
          <div className="mb-md flex flex-col gap-[6px]">
            {closures.map((closure) => (
              <div key={closure.id} className="flex items-center gap-md rounded-sm bg-surface-subtle px-md py-[8px]">
                <span className="w-[200px] shrink-0 text-[12.5px] font-medium tabular-nums text-on-surface">
                  {formatClosureRange(closure.startsAt, closure.endsAt, timezone, lang)}
                </span>
                <span className="flex-1 text-[12.5px] text-on-surface-muted">{closure.reason}</span>
                <button
                  type="button"
                  onClick={() => setClosureDeleteTarget(closure)}
                  title={dict.deleteClosure}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-on-surface-muted hover:bg-error/12 hover:text-error"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form action={closureFormAction} className="flex flex-wrap items-end gap-sm border-t border-surface-raised pt-md">
          <div>
            <label className="mb-[4px] block text-[11.5px] font-medium text-on-surface">{dict.closureDate}</label>
            <input
              type="date"
              name="date"
              required
              className="rounded-sm border border-border bg-surface px-[10px] py-[6px] text-[12.5px] text-on-surface"
            />
          </div>
          <label className="flex items-center gap-[6px] pb-[8px] text-[12px] text-on-surface">
            <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {dict.closureAllDay}
          </label>
          {!allDay && (
            <>
              <div>
                <label className="mb-[4px] block text-[11.5px] font-medium text-on-surface">{dict.closureStart}</label>
                <input type="time" name="startTime" required className={timeInputClass} />
              </div>
              <div>
                <label className="mb-[4px] block text-[11.5px] font-medium text-on-surface">{dict.closureEnd}</label>
                <input type="time" name="endTime" required className={timeInputClass} />
              </div>
            </>
          )}
          <div className="min-w-[180px] flex-1">
            <label className="mb-[4px] block text-[11.5px] font-medium text-on-surface">{dict.closureReason}</label>
            <input
              type="text"
              name="reason"
              maxLength={120}
              placeholder={dict.closureReasonPlaceholder}
              className="w-full rounded-sm border border-border bg-surface px-[10px] py-[6px] text-[12.5px] text-on-surface"
            />
          </div>
          <Button type="submit" disabled={closurePending} className="!px-md !py-[8px] !text-[13px]">
            {dict.create}
          </Button>
        </form>
        {closureState && "error" in closureState && (
          <p role="alert" className="mt-sm text-[12.5px] text-error">
            {dict.errorInvalid}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={closureDeleteTarget !== null}
        onClose={() => setClosureDeleteTarget(null)}
        onConfirm={handleConfirmDeleteClosure}
        title={dict.deleteClosureConfirmTitle}
        body={
          closureDeleteTarget
            ? `${formatClosureRange(closureDeleteTarget.startsAt, closureDeleteTarget.endsAt, timezone, lang)} — ${dict.deleteClosureConfirmBody}`
            : dict.deleteClosureConfirmBody
        }
        confirmLabel={dict.deleteClosure}
        cancelLabel={dict.cancel}
        pending={closureDeletePending}
      />
    </div>
  );
}
