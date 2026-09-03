import { ReactNode } from "react";

export function OfferBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent-warm-border bg-accent-warm px-[14px] py-[6px] text-[13px] tracking-[0.01em] text-on-accent-warm">
      {children}
    </span>
  );
}
