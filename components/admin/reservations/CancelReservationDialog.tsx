"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AgendaReservationDTO } from "@/lib/reservations/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { cancelReservationAction } from "@/lib/reservations/staff-actions";

export function CancelReservationDialog({
  reservation,
  dict,
  onClose,
}: {
  reservation: AgendaReservationDTO | null;
  dict: AdminDictionary["reservations"];
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  function confirm() {
    if (!reservation) return;
    startTransition(async () => {
      const result = await cancelReservationAction(reservation.id, reason);
      if (result?.error === "reason_required") {
        setError(dict.cancelReasonRequired);
        return;
      }
      if (result?.error === "forbidden") {
        setError(dict.cancelForbidden);
        return;
      }
      handleClose();
    });
  }

  return (
    <Modal open={reservation !== null} onClose={handleClose} title={dict.cancelAction}>
      {reservation && (
        <>
          <p className="mb-md text-[13.5px] text-on-surface-muted">{reservation.guestName}</p>
          <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
            {dict.cancelReasonLabel}
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder={dict.cancelReasonPlaceholder}
            rows={3}
            className="w-full resize-none rounded-sm border border-border/50 bg-surface px-sm py-[8px] text-[13.5px] text-on-surface outline-none focus:border-primary"
          />
          {error && <p className="mt-[4px] text-[12px] text-error">{error}</p>}
          <div className="mt-lg flex justify-end gap-sm">
            <Button type="button" variant="secondary" onClick={handleClose}>
              {dict.cancelBack}
            </Button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-full bg-error px-[28px] py-[14px] text-[15px] font-medium tracking-[0.01em] text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.cancelConfirm}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
