"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { switchBusinessAction } from "@/lib/auth/switch-actions";
import { ChevronDownIcon } from "./icons";

type UserMenuProps = {
  name: string;
  email: string;
  signOutLabel: string;
  /** Businesses this user may act on; the switcher shows only when there are two or more. */
  businesses: Array<{ id: string; name: string }>;
  activeBusinessId: string | null;
  switchLabel: string;
  switchErrorLabel: string;
};

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  name,
  email,
  signOutLabel,
  businesses,
  activeBusinessId,
  switchLabel,
  switchErrorLabel,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const [switching, startSwitch] = useTransition();
  const router = useRouter();

  function handleSwitch(businessId: string) {
    if (businessId === activeBusinessId) return;
    setSwitchError(false);
    startSwitch(async () => {
      const result = await switchBusinessAction(businessId);
      if (!result.ok) {
        setSwitchError(true);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-[8px] rounded-full py-[4px] pl-[4px] pr-[8px] transition-colors hover:bg-surface-subtle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-ocean text-[13px] font-semibold text-primary">
          {initials(name, email)}
        </span>
        <span className="hidden text-[13px] text-on-surface sm:inline">
          {name || email}
        </span>
        <ChevronDownIcon className="text-on-surface-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-[220px] rounded-md border border-border bg-surface p-[6px] shadow-2"
        >
          <div className="border-b border-border px-[10px] pb-[8px] pt-[4px]">
            <p className="truncate text-[13px] font-medium text-on-surface">
              {name || email}
            </p>
            <p className="truncate text-[12px] text-on-surface-muted">
              {email}
            </p>
          </div>
          {businesses.length > 1 && (
            <div className="border-b border-border px-[10px] py-[8px]">
              <label className="mb-[4px] block text-[11.5px] text-on-surface-muted" htmlFor="switch-business">
                {switchLabel}
              </label>
              <select
                id="switch-business"
                value={activeBusinessId ?? ""}
                disabled={switching}
                onChange={(e) => handleSwitch(e.target.value)}
                className="w-full rounded-sm border border-border bg-surface px-[8px] py-[6px] text-[13px] text-on-surface"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {switchError && (
                <p role="alert" className="mt-[4px] text-[11.5px] text-error">
                  {switchErrorLabel}
                </p>
              )}
            </div>
          )}
          <form action={signOutAction} className="pt-[6px]">
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-sm px-[10px] py-[8px] text-left text-[13px] text-on-surface transition-colors hover:bg-surface-subtle"
            >
              {signOutLabel}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
