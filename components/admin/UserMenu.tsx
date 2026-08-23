"use client";

import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { ChevronDownIcon } from "./icons";

type UserMenuProps = {
  name: string;
  email: string;
  signOutLabel: string;
};

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({ name, email, signOutLabel }: UserMenuProps) {
  const [open, setOpen] = useState(false);
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
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-[200px] rounded-md border border-border bg-surface p-[6px] shadow-2"
        >
          <div className="border-b border-border px-[10px] pb-[8px] pt-[4px]">
            <p className="truncate text-[13px] font-medium text-on-surface">
              {name || email}
            </p>
            <p className="truncate text-[12px] text-on-surface-muted">
              {email}
            </p>
          </div>
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
