"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { AgendaReservationDTO } from "@/lib/reservations/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { cancelReservationAction } from "@/lib/reservations/staff-actions";

/** Reuses ConfirmDialog, same as the guest-facing CancelReservationButton — the reason textarea and its validation error are just phrasing content passed through `body`, not a reason to hand-roll a second dialog. */
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
      if (result?.error) {
        setError(dict.errorGeneric);
        return;
      }
      handleClose();
    });
  }

  return (
    <ConfirmDialog
      open={reservation !== null}
      onClose={handleClose}
      onConfirm={confirm}
      title={dict.cancelAction}
      confirmLabel={dict.cancelConfirm}
      cancelLabel={dict.cancelBack}
      pending={pending}
      body={
        reservation && (
          <>
            <span className="mb-md block text-[13.5px] text-on-surface-muted">{reservation.guestName}</span>
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
            {error && <span className="mt-[4px] block text-[12px] text-error">{error}</span>}
          </>
        )
      }
    />
  );
}
