"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "./icons";

type Option = { value: string; label: string };

type DropdownProps = {
  id: string;
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
};

export function Dropdown({ id, label, options, value, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sel = options.find((o) => o.value === value);

  return (
    <div className={`ml-dd${open ? " open" : ""}`} ref={ref}>
      {label && (
        <label className="ml-dd-label" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        className="ml-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{sel ? sel.label : ""}</span>
        <span className="ml-dd-chev">
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <div className="ml-dd-menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`ml-dd-opt${o.value === value ? " sel" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
