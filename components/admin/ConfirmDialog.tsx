"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  pending?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[14px] text-on-surface-muted">{body}</p>
      <div className="mt-lg flex justify-end gap-sm">
        <Button type="button" variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        {destructive ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-full bg-error px-[28px] py-[14px] text-[15px] font-medium tracking-[0.01em] text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        ) : (
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}
