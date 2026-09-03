"use client";

import { ReactNode, useEffect } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-lg">
      <button
        aria-label="Close backdrop"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative w-full max-w-[460px] rounded-xl bg-surface p-lg shadow-hero">
        <button
          aria-label="Close"
          onClick={onClose}
          type="button"
          className="absolute right-lg top-lg flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted transition-colors hover:bg-surface-subtle hover:text-on-surface"
        >
          ×
        </button>
        {title && (
          <h3 className="mb-md pr-xl font-display text-[20px] font-semibold text-on-surface">
            {title}
          </h3>
        )}
        <div className="text-on-surface">{children}</div>
        {footer && <div className="mt-lg flex justify-end gap-sm">{footer}</div>}
      </div>
    </div>
  );
}
