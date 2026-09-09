"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { ReservationDictionary } from "@/lib/i18n/dictionaries";
import { cancelReservationByCodeAction } from "@/lib/reservations/actions";

/**
 * confirmationCode is the only auth this page has — this component never
 * receives more than that string plus the page's own dictionary, so there's
 * nothing here for a client-side inspector to learn beyond what the page
 * already rendered.
 *
 * Reuses ConfirmDialog (the same destructive-confirm pattern the admin
 * panel's cancel-order flow uses) instead of a second hand-rolled dialog.
 */
export function CancelReservationButton({
  confirmationCode,
  dict,
}: {
  confirmationCode: string;
  dict: ReservationDictionary;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservationByCodeAction(confirmationCode);
      if (result.ok) {
        setOpen(false);
        setSucceeded(true);
        // Deliberately no router.refresh() here: on a fast connection its
        // fresh data (canCancel now false) can land before React ever
        // paints `succeeded`, unmounting this component — and the message
        // below — before the guest sees it. The page's status badge only
        // goes stale until the guest reloads, which re-fetches from the DB
        // and shows "Cancelled" correctly anyway.
        return;
      }
      setError(result.error === "too_late" ? dict.cancelTooLateError : dict.cancelGenericError);
    });
  }

  if (succeeded) {
    return <p className="text-[13px] font-medium text-success">{dict.cancelSuccessBody}</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-medium text-error underline decoration-error/40 underline-offset-2"
      >
        {dict.cancelButton}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title={dict.cancelConfirmTitle}
        body={
          <>
            {dict.cancelConfirmBody}
            {error && <span className="mt-sm block text-[13px] font-medium text-error">{error}</span>}
          </>
        }
        confirmLabel={dict.cancelConfirmYes}
        cancelLabel={dict.cancelConfirmNo}
        pending={pending}
      />
    </>
  );
}
