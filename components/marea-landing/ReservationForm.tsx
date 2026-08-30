"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "./Dropdown";
import { STR, type Lang } from "./content";
import { getReservationSlotsAction, createReservationAction } from "@/lib/reservations/actions";
import { MAX_BOOKING_HORIZON_DAYS } from "@/lib/reservations/schemas";

type SlotsState = "idle" | "loading" | "loaded";
type SubmitState = "idle" | "submitting" | "success";

/** "14:30" -> "2:30 PM" — display only, the value sent back to the server is always the raw "HH:mm" the slots action returned. */
function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function ReservationForm({ lang, maxPartySize }: { lang: Lang; maxPartySize: number }) {
  const t = STR[lang].reserve;

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(() => String(Math.min(2, maxPartySize)));
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  const [slots, setSlots] = useState<string[]>([]);
  const [slotsState, setSlotsState] = useState<SlotsState>("idle");

  const [nameError, setNameError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const todayLocal = useState(() => new Date().toISOString().slice(0, 10))[0];
  const maxBookableDate = useState(
    () => new Date(Date.now() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  )[0];
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!date) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlots([]);
      setSlotsState("idle");
      return;
    }
    let cancelled = false;
    setSlotsState("loading");
    setConflict(false);
    getReservationSlotsAction(date, Number(partySize)).then((result) => {
      if (cancelled) return;
      const times = result.ok ? result.times : [];
      setSlots(times);
      setSlotsState("loaded");
      setTime((prev) => (times.includes(prev) ? prev : ""));
    });
    return () => {
      cancelled = true;
    };
  }, [date, partySize]);

  const guestOptions = Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: `${n} ${n === 1 ? t.guest : t.guestP}`,
  }));
  const timeOptions = slots.map((s) => ({ value: s, label: formatTimeLabel(s) }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);
    setGenericError(null);

    const trimmedName = guestName.trim();
    setNameError(trimmedName ? null : t.nameRequired);
    setContactError(guestEmail || guestPhone ? null : t.contactRequired);
    if (!trimmedName || (!guestEmail && !guestPhone) || !time) return;

    setSubmitState("submitting");
    const result = await createReservationAction({
      guestName: trimmedName,
      guestEmail: guestEmail || undefined,
      guestPhone: guestPhone || undefined,
      partySize: Number(partySize),
      date,
      time,
      notes: notes || undefined,
    });

    if (result.ok) {
      setConfirmationCode(result.confirmationCode);
      setSubmitState("success");
      return;
    }

    setSubmitState("idle");
    if (result.error === "slot_taken") {
      setConflict(true);
      setTime("");
      const refreshed = await getReservationSlotsAction(date, Number(partySize));
      setSlots(refreshed.ok ? refreshed.times : []);
    } else if (result.error === "rate_limited") {
      setGenericError(t.rateLimitedError);
    } else {
      setGenericError(t.genericError);
    }
  }

  async function handleCopyCode() {
    if (!confirmationCode) return;
    try {
      await navigator.clipboard.writeText(confirmationCode);
      setCodeCopied(true);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the code is still visible to copy by hand.
    }
  }

  if (submitState === "success" && confirmationCode) {
    return (
      <div className="ml-form-card">
        <div className="ml-reserve-success">
          <div className="ml-success-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 style={{ margin: 0 }}>{t.successTitle}</h3>
          <p style={{ margin: 0, color: "rgb(var(--color-on-surface-muted))" }}>
            {t.successBody
              .replace("{date}", date)
              .replace("{time}", formatTimeLabel(time))
              .replace("{guests}", partySize)}
          </p>
          <div>
            <div className="ml-form-hint">{t.confirmationCodeLabel}</div>
            <div className="ml-confirmation-code">{confirmationCode}</div>
          </div>
          <p className="ml-form-hint" style={{ maxWidth: "34ch" }}>
            {t.successFinePrint}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Button type="button" variant="secondary" onClick={handleCopyCode}>
              {codeCopied ? t.codeCopied : t.copyCode}
            </Button>
            <Link href={`/r/${confirmationCode}`} className="ml-form-hint" style={{ alignSelf: "center" }}>
              {t.viewReservationLink}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const submitting = submitState === "submitting";

  return (
    <form className="ml-form-card" onSubmit={handleSubmit}>
      <div className="field">
        <Input
          id="r-name"
          label={t.name}
          placeholder={t.namePh}
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          disabled={submitting}
        />
        {nameError && <p className="ml-field-error">{nameError}</p>}
      </div>

      <div className="ml-form-row">
        <div className="field">
          <Input
            id="r-email"
            type="email"
            label={t.email}
            placeholder={t.emailPh}
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="field">
          <Input
            id="r-phone"
            type="tel"
            label={t.phone}
            placeholder={t.phonePh}
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>
      {contactError ? (
        <p className="ml-field-error" style={{ marginTop: -10 }}>
          {contactError}
        </p>
      ) : (
        <p className="ml-form-hint" style={{ marginTop: -10 }}>
          {t.contactHint}
        </p>
      )}

      <div className="ml-form-row">
        <div className="field">
          <Dropdown
            id="r-guests"
            label={t.guests}
            options={guestOptions}
            value={partySize}
            onChange={setPartySize}
            disabled={submitting}
          />
        </div>
        <div className="field">
          <Input
            id="r-date"
            label={t.date}
            type="date"
            min={todayLocal}
            max={maxBookableDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="field">
        {slotsState === "loading" ? (
          <>
            <span className="ml-dd-label">{t.time}</span>
            <div className="ml-form-note loading">
              <span
                className="ml-spinner"
                style={{
                  borderColor: "rgb(var(--color-primary) / 0.25)",
                  borderTopColor: "rgb(var(--color-primary))",
                }}
              />
              {t.loadingSlots}
            </div>
          </>
        ) : (
          <Dropdown
            id="r-time"
            label={t.time}
            options={[{ value: "", label: t.chooseTime }, ...timeOptions]}
            value={time}
            onChange={(v) => {
              setConflict(false);
              setTime(v);
            }}
            disabled={submitting}
          />
        )}
        {date && slotsState === "loaded" && timeOptions.length === 0 && (
          <div className="ml-form-note warn" style={{ marginTop: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>
              <strong>{t.noSlotsTitle}</strong> — {t.noSlotsBody.replace("{n}", partySize)}
            </span>
          </div>
        )}
        {conflict && (
          <div className="ml-form-note err" style={{ marginTop: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span>{t.conflictBody}</span>
          </div>
        )}
      </div>

      <div className="ml-ta-field">
        <label htmlFor="r-notes">{t.comments}</label>
        <textarea
          id="r-notes"
          placeholder={t.commentsPh}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
        />
      </div>

      {genericError && <p className="ml-field-error">{genericError}</p>}

      <Button
        variant="primary"
        type="submit"
        style={{ width: "100%" }}
        disabled={submitting || !time}
      >
        {submitting && <span className="ml-spinner" style={{ marginRight: 8 }} />}
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
