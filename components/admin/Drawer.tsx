"use client";

import { ReactNode, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The admin panel's side panel for content too rich for a Modal's centered
 * dialog but not its own route — an order's full payment detail, in this
 * module's case. Implements design.md's `drawer` token as-is: `rounded:
 * "20px 0 0 20px"` (only the interior corners — the right edge meets the
 * viewport), fixed `width: 480px`, `shadow-hero` to separate from the board
 * that stays visible behind it.
 *
 * `role="dialog"`/`aria-modal`, initial focus on open, and Tab containment
 * within the panel — a keyboard user tabbing through the board behind it
 * would otherwise reach content that's supposed to be covered.
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Whatever had focus before the drawer opened — almost always the board
  // badge that triggered it. Restored on close so a keyboard user lands
  // back where they were instead of at the top of the document, which is
  // where focus goes by default once the panel it was trapped in unmounts.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Capturing and restoring focus only keys off `open` — not `onClose` — on
  // purpose. onClose is an inline arrow function at every call site
  // (OrdersBoard re-creates it on every render), and the board re-renders
  // on every live order event over SSE even while this drawer sits open.
  // Keying this effect on `onClose` too would re-run it on each of those
  // unrelated re-renders, yanking focus out to the just-restored element
  // and back in — an admin mid-keystroke in RefundForm would feel their
  // cursor jump every time a different order changed on the board.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocusedRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
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
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[480px] flex-col rounded-l-[20px] bg-surface shadow-hero outline-none"
      >
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
