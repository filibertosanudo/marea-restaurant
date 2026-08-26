"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cancelReservationByCodeAction } from "@/lib/reservations/actions";

type CancelDictionary = {
  cancelButton: string;
  cancelConfirmTitle: string;
  cancelConfirmBody: string;
  cancelConfirmYes: string;
  cancelConfirmNo: string;
  cancelTooLateError: string;
  cancelGenericError: string;
};

/**
 * confirmationCode is the only auth this page has — this component never
 * receives more than that string plus its own display copy, so there's
 * nothing here for a client-side inspector to learn beyond what the page
 * already rendered.
 */
export function CancelReservationButton({
  confirmationCode,
  dict,
}: {
  confirmationCode: string;
  dict: CancelDictionary;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelReservationByCodeAction(confirmationCode);
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setError(result.error === "too_late" ? dict.cancelTooLateError : dict.cancelGenericError);
    });
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
      <Modal open={open} onClose={() => setOpen(false)} title={dict.cancelConfirmTitle}>
        <p className="text-[14px] text-on-surface-muted">{dict.cancelConfirmBody}</p>
        {error && <p className="mt-sm text-[13px] font-medium text-error">{error}</p>}
        <div className="mt-lg flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {dict.cancelConfirmNo}
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-full bg-error px-[28px] py-[14px] text-[15px] font-medium tracking-[0.01em] text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dict.cancelConfirmYes}
          </button>
        </div>
      </Modal>
    </>
  );
}
