"use client";

import { ReactNode, useEffect } from "react";

/**
 * The admin panel's side panel for content too rich for a Modal's centered
 * dialog but not its own route — an order's full payment detail, in this
 * module's case. Implements design.md's `drawer` token as-is: `rounded:
 * "20px 0 0 20px"` (only the interior corners — the right edge meets the
 * viewport), fixed `width: 480px`, `shadow-hero` to separate from the board
 * that stays visible behind it.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close backdrop"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
      />
      <div className="relative flex h-full w-full max-w-[480px] flex-col rounded-l-[20px] bg-surface shadow-hero">
        <div className="flex shrink-0 items-center justify-between px-lg pt-lg">
          {title && <h3 className="font-display text-[18px] font-semibold text-on-surface">{title}</h3>}
          <button
            aria-label="Close"
            onClick={onClose}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted transition-colors hover:bg-surface-subtle hover:text-on-surface"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-lg py-lg text-on-surface">{children}</div>
      </div>
    </div>
  );
}
