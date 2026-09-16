"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { PromotionListDTO } from "@/lib/dto/promotions";
import type { PromotionType } from "@/lib/generated/prisma/client";
import { describePromotion } from "@/lib/promotions/describe";
import {
  createPromotionAction,
  updatePromotionAction,
  type PromotionFormState,
} from "@/lib/promotions/actions";

const PROMOTION_TYPES: PromotionType[] = ["PERCENTAGE", "FIXED_AMOUNT", "BUNDLE_PRICE", "FREE_ITEM"];
const ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "PICKUP", "DELIVERY"] as const;

function minutesToTime(minutes: number | null): string {
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  // Deliberately not timezone-resolved here: an admin editing an existing
  // promotion sees (and re-submits) the same instant the browser's own
  // locale already renders it in, same round-trip an <input type="datetime-local">
  // always does — the server is what resolves against the business's
  // timezone on save, via parseLocalDateTime.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PromotionEditorDrawerProps = {
  onClose: () => void;
  dict: AdminDictionary;
  defaultLocale: Lang;
  /** The admin panel's own display language — drives the preview sentence. Distinct from `locale` below, which only picks which translation tab is being edited. */
  lang: Lang;
  promotion: PromotionListDTO | null;
  menuItems: { id: string; name: string }[];
};

export function PromotionEditorDrawer({
  onClose,
  dict,
  defaultLocale,
  lang,
  promotion,
  menuItems,
}: PromotionEditorDrawerProps) {
  const isEdit = !!promotion;
  const action = isEdit ? updatePromotionAction : createPromotionAction;
  const [state, formAction, pending] = useActionState<PromotionFormState, FormData>(
    action,
    undefined
  );

  const [locale, setLocale] = useState<Lang>(defaultLocale);
  const [type, setType] = useState<PromotionType>(promotion?.type ?? "PERCENTAGE");
  const [value, setValue] = useState(promotion?.value ?? "");
  const [code, setCode] = useState(promotion?.code ?? "");
  const [selectedDays, setSelectedDays] = useState<number[]>(promotion?.daysOfWeek ?? []);
  const [startTime, setStartTime] = useState(minutesToTime(promotion?.startMinute ?? null));
  const [endTime, setEndTime] = useState(minutesToTime(promotion?.endMinute ?? null));
  const [minOrderTotal, setMinOrderTotal] = useState(promotion?.minOrderTotal ?? "");
  const [maxDiscount, setMaxDiscount] = useState(promotion?.maxDiscount ?? "");
  const [selectedMenuItems, setSelectedMenuItems] = useState<string[]>(promotion?.menuItemIds ?? []);

  useEffect(() => {
    if (state && "success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const preview = useMemo(
    () =>
      describePromotion(
        {
          type,
          value: value || "0",
          code: code || null,
          daysOfWeek: selectedDays,
          startMinute: parseTime(startTime),
          endMinute: parseTime(endTime),
          minOrderTotal: minOrderTotal || null,
          maxDiscount: maxDiscount || null,
        },
        dict,
        lang
      ),
    [type, value, code, selectedDays, startTime, endTime, minOrderTotal, maxDiscount, dict, lang]
  );

  function toggleDay(day: number) {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close backdrop"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
      />
      <div className="relative flex h-full w-full max-w-[560px] flex-col rounded-l-lg bg-surface shadow-hero">
        <div className="flex shrink-0 items-start justify-between border-b border-border px-lg py-md">
          <h2 className="font-display text-[19px] font-semibold text-on-surface">
            {isEdit ? dict.promotions.editPromotion : dict.promotions.newPromotion}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
          >
            ×
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col overflow-y-auto px-lg py-md">
          {isEdit && <input type="hidden" name="id" value={promotion!.id} />}

          <div className="flex flex-col gap-md">
            <div>
              <label className="mb-[6px] block text-[13px] font-medium text-on-surface">
                {dict.promotions.fieldType}
              </label>
              <div className="grid grid-cols-4 gap-[8px]">
                {PROMOTION_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`cursor-pointer rounded-sm border px-[8px] py-[10px] text-center text-[12px] ${
                      type === t
                        ? "border-primary bg-surface-ocean text-primary"
                        : "border-border bg-surface text-on-surface-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={type === t}
                      onChange={() => setType(t)}
                      className="sr-only"
                    />
                    {t === "PERCENTAGE" && dict.promotions.typePercentage}
                    {t === "FIXED_AMOUNT" && dict.promotions.typeFixedAmount}
                    {t === "BUNDLE_PRICE" && dict.promotions.typeBundlePrice}
                    {t === "FREE_ITEM" && dict.promotions.typeFreeItem}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldValue} <span className="text-error">*</span>
                </label>
                <input
                  name="value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldCode}
                </label>
                <input
                  name="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="WELCOME15"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
                <p className="mt-[3px] text-[12px] text-on-surface-muted">{dict.promotions.fieldCodeHint}</p>
              </div>
            </div>

            <div className="rounded-md border border-surface-ocean-border bg-surface-ocean px-md py-[12px]">
              <p className="mb-[4px] text-[11px] font-medium uppercase tracking-[0.03em] text-on-surface-muted">
                {dict.promotions.previewLabel}
              </p>
              <p className="font-display text-[15px] font-semibold text-on-surface">{preview}</p>
            </div>

            <Tabs
              items={[
                { id: "en", label: "EN" },
                { id: "es", label: "ES" },
              ]}
              value={locale}
              onChange={(id) => setLocale(id as Lang)}
            />
            {(["en", "es"] as const).map((l) => (
              <div key={l} className={l === locale ? "flex flex-col gap-md" : "hidden"}>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.promotions.fieldTitle} ({l.toUpperCase()})
                    {l === defaultLocale && <span className="text-error"> *</span>}
                  </label>
                  <input
                    name={`${l}.title`}
                    defaultValue={promotion?.translations[l]?.title ?? ""}
                    required={l === defaultLocale}
                    className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.promotions.fieldDescription} ({l.toUpperCase()})
                  </label>
                  <textarea
                    name={`${l}.description`}
                    defaultValue={promotion?.translations[l]?.description ?? ""}
                    rows={2}
                    className="w-full resize-none rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.promotions.fieldBadgeLabel} ({l.toUpperCase()})
                  </label>
                  <input
                    name={`${l}.badgeLabel`}
                    defaultValue={promotion?.translations[l]?.badgeLabel ?? ""}
                    className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                  />
                  <p className="mt-[3px] text-[12px] text-on-surface-muted">
                    {dict.promotions.fieldBadgeLabelHint}
                  </p>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldMinOrderTotal}
                </label>
                <input
                  name="minOrderTotal"
                  value={minOrderTotal}
                  onChange={(e) => setMinOrderTotal(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldMaxDiscount}
                </label>
                <input
                  name="maxDiscount"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldStartsAt}
                </label>
                <input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(promotion?.startsAt ?? null)}
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldEndsAt}
                </label>
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(promotion?.endsAt ?? null)}
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="mb-[6px] block text-[13px] font-medium text-on-surface">
                {dict.promotions.fieldDaysOfWeek}
              </label>
              <div className="flex flex-wrap gap-[6px]">
                {dict.settings.dayNames.map((name, index) => (
                  <label
                    key={index}
                    className={`cursor-pointer rounded-full border px-[12px] py-[6px] text-[12px] ${
                      selectedDays.includes(index)
                        ? "border-primary bg-surface-ocean text-primary"
                        : "border-border bg-surface-subtle text-on-surface-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="daysOfWeek"
                      value={index}
                      checked={selectedDays.includes(index)}
                      onChange={() => toggleDay(index)}
                      className="sr-only"
                    />
                    {name.slice(0, 3)}
                  </label>
                ))}
              </div>
              <p className="mt-[4px] text-[12px] text-on-surface-muted">{dict.promotions.fieldDaysHint}</p>
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldStartTime}
                </label>
                <input
                  name="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldEndTime}
                </label>
                <input
                  name="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldUsageLimit}
                </label>
                <input
                  name="usageLimit"
                  defaultValue={promotion?.usageLimit ?? ""}
                  inputMode="numeric"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldPerUserLimit}
                </label>
                <input
                  name="perUserLimit"
                  defaultValue={promotion?.perUserLimit ?? ""}
                  inputMode="numeric"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
                />
                <p className="mt-[3px] text-[12px] text-on-surface-muted">
                  {dict.promotions.fieldPerUserLimitHint}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                {dict.promotions.fieldOrderType}
              </label>
              <select
                name="appliesToOrderType"
                defaultValue={promotion?.appliesToOrderType ?? ""}
                className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary"
              >
                <option value="">{dict.promotions.allOrderTypes}</option>
                {ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {menuItems.length > 0 && (
              <div>
                <label className="mb-[6px] block text-[13px] font-medium text-on-surface">
                  {dict.promotions.fieldMenuItems}
                </label>
                <p className="mb-[6px] text-[12px] text-on-surface-muted">{dict.promotions.allMenuItems}</p>
                <div className="flex max-h-[140px] flex-col gap-[4px] overflow-y-auto rounded-sm border border-border p-[8px]">
                  {menuItems.map((item) => {
                    const checked = selectedMenuItems.includes(item.id);
                    return (
                      <label key={item.id} className="flex items-center gap-[8px] text-[13px] text-on-surface">
                        <input
                          type="checkbox"
                          name="menuItemIds"
                          value={item.id}
                          checked={checked}
                          onChange={(e) =>
                            setSelectedMenuItems((prev) =>
                              e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                            )
                          }
                        />
                        {item.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex items-center justify-between rounded-sm bg-surface-subtle px-md py-[10px]">
              <span className="text-[13px] font-medium text-on-surface">{dict.promotions.fieldActive}</span>
              <input type="checkbox" name="isActive" defaultChecked={promotion?.isActive ?? true} />
            </label>
            <label className="flex items-center justify-between rounded-sm bg-surface-subtle px-md py-[10px]">
              <span className="text-[13px] font-medium text-on-surface">{dict.promotions.fieldFeatured}</span>
              <input type="checkbox" name="isFeatured" defaultChecked={promotion?.isFeatured ?? false} />
            </label>

            {state && "error" in state && (
              <p role="alert" className="text-[13px] text-error">
                {state.error === "code_taken" ? dict.promotions.codeTaken : dict.promotions.errorGeneric}
              </p>
            )}
          </div>

          <div className="mt-lg flex shrink-0 justify-end gap-sm border-t border-border pt-md">
            <Button type="button" variant="secondary" onClick={onClose}>
              {dict.promotions.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {dict.promotions.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
