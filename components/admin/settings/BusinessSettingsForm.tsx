"use client";

import { useActionState, useRef, useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { updateBusinessSettingsAction, type SettingsFormState } from "@/lib/settings/actions";
import { TIMEZONES, CURRENCIES } from "@/lib/settings/schemas";

type SettingsDict = AdminDictionary["settings"];

export type BusinessSettings = {
  defaultLocale: string;
  currency: string;
  timezone: string;
  defaultReservationMinutes: number;
  maxPartySize: number;
  acceptsOnlinePayment: boolean;
  minBookingLeadMinutes: number;
  minCancelLeadMinutes: number;
};

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[12.5px] font-medium text-on-surface";
const fieldClass = "mb-md";
const cardClass = "mb-md rounded-md border border-border bg-surface p-md";

export function BusinessSettingsForm({ dict, business }: { dict: SettingsDict; business: BusinessSettings }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    updateBusinessSettingsAction,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const timezoneConfirmedRef = useRef(false);
  const [confirmingTimezone, setConfirmingTimezone] = useState(false);
  const [acceptsOnlinePayment, setAcceptsOnlinePayment] = useState(business.acceptsOnlinePayment);

  /**
   * requestSubmit() below re-dispatches through this same handler, so a
   * flag (not just closing the dialog) is what lets the second pass
   * through — otherwise business.timezone (the original, unrefreshed
   * prop) never changes and the guard fires forever, and the form can
   * never actually reach the server once a timezone change is involved.
   */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (timezoneConfirmedRef.current) {
      timezoneConfirmedRef.current = false;
      return;
    }
    const selectedTimezone = new FormData(e.currentTarget).get("timezone");
    if (typeof selectedTimezone === "string" && selectedTimezone !== business.timezone) {
      e.preventDefault();
      setConfirmingTimezone(true);
    }
  }

  function confirmTimezoneChange() {
    setConfirmingTimezone(false);
    timezoneConfirmedRef.current = true;
    formRef.current?.requestSubmit();
  }

  const fieldError = (name: string) => (state && "fieldErrors" in state ? state.fieldErrors?.[name] : undefined);

  return (
    <form ref={formRef} action={formAction} onSubmit={handleSubmit}>
      <div className={cardClass}>
        <h2 className="mb-[2px] text-[16px] font-semibold text-on-surface">{dict.identityTitle}</h2>
        <p className="mb-md text-[12px] text-on-surface-muted">{dict.identityLead}</p>

        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <div className={fieldClass}>
            <label className={labelClass}>{dict.localeLabel}</label>
            <select name="defaultLocale" defaultValue={business.defaultLocale} className={inputClass}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>{dict.currencyLabel}</label>
            <select name="currency" defaultValue={business.currency} className={inputClass}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className={`${fieldClass} sm:col-span-2`}>
            <label className={labelClass}>{dict.timezoneLabel}</label>
            <select name="timezone" defaultValue={business.timezone} className={inputClass}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="mt-[4px] text-[11px] text-on-surface-muted">{dict.timezoneHint}</p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-[2px] text-[16px] font-semibold text-on-surface">{dict.reservationsTitle}</h2>
        <p className="mb-md text-[12px] text-on-surface-muted">{dict.reservationsLead}</p>

        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <div className={fieldClass}>
            <label className={labelClass}>{dict.durationLabel}</label>
            <input
              type="number"
              name="defaultReservationMinutes"
              defaultValue={business.defaultReservationMinutes}
              min={15}
              max={480}
              required
              className={inputClass}
            />
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>{dict.maxPartyLabel}</label>
            <input
              type="number"
              name="maxPartySize"
              defaultValue={business.maxPartySize}
              min={1}
              max={50}
              required
              className={inputClass}
            />
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>{dict.minBookingLabel}</label>
            <input
              type="number"
              name="minBookingLeadMinutes"
              defaultValue={business.minBookingLeadMinutes}
              min={0}
              max={1440}
              required
              className={inputClass}
            />
            {fieldError("minBookingLeadMinutes") && <p className="mt-[4px] text-[12px] text-error">{dict.errorInvalid}</p>}
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>{dict.minCancelLabel}</label>
            <input
              type="number"
              name="minCancelLeadMinutes"
              defaultValue={business.minCancelLeadMinutes}
              min={0}
              max={4320}
              required
              className={inputClass}
            />
            {fieldError("minCancelLeadMinutes") && <p className="mt-[4px] text-[12px] text-error">{dict.errorInvalid}</p>}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-md text-[16px] font-semibold text-on-surface">{dict.paymentsTitle}</h2>
        <div className="flex items-center justify-between gap-md">
          <div>
            <div className="text-[13px] font-medium text-on-surface">{dict.onlinePaymentLabel}</div>
            <div className="text-[11.5px] text-on-surface-muted">{dict.onlinePaymentHint}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={acceptsOnlinePayment}
            onClick={() => setAcceptsOnlinePayment((v) => !v)}
            className={`relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors ${
              acceptsOnlinePayment ? "bg-success" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-surface transition-transform ${
                acceptsOnlinePayment ? "translate-x-[16px]" : "translate-x-[2px]"
              }`}
            />
          </button>
          <input type="hidden" name="acceptsOnlinePayment" value={acceptsOnlinePayment ? "on" : ""} />
        </div>
      </div>

      {state && "error" in state && (
        <p role="alert" className="mb-md text-[13px] text-error">
          {dict.errorGeneric}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {dict.saveSettings}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingTimezone}
        onClose={() => setConfirmingTimezone(false)}
        onConfirm={confirmTimezoneChange}
        title={dict.timezoneConfirmTitle}
        body={`${dict.timezoneWarning} ${dict.timezoneConfirmBody}`}
        confirmLabel={dict.timezoneConfirmYes}
        cancelLabel={dict.timezoneConfirmNo}
        destructive={false}
      />
    </form>
  );
}
