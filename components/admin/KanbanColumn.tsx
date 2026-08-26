import type { ReactNode } from "react";
import type { BoardDensity } from "./OrderCard";

// Column headers are the shell, not the ticket itself, so they don't need
// the full 40-60px jump the finding calls for on the folio/lines — but they
// still have to hold up next to cards that just got much bigger. See
// BoardDensity in OrderCard.tsx for why this is a variant, not a duplicate
// component.
const SCALE = {
  kitchen: { title: "text-[18px] tracking-wide", count: "px-md py-[4px] text-[22px]" },
  waiter: { title: "text-[13px] tracking-wide", count: "px-sm py-[2px] text-[15px]" },
} as const;

export function KanbanColumn({
  title,
  count,
  children,
  emptyLabel,
  density,
}: {
  title: string;
  count: number;
  children: ReactNode;
  emptyLabel: string;
  density: BoardDensity;
}) {
  const s = SCALE[density];
  return (
    <div className="flex min-w-0 flex-col bg-surface-subtle">
      <div className="flex flex-none items-center justify-between bg-surface px-md py-[14px]">
        <span className={`font-semibold uppercase text-on-surface-muted ${s.title}`}>{title}</span>
        <span
          className={`rounded-sm bg-border/16 font-display font-bold tabular-nums text-on-surface ${s.count}`}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-sm overflow-y-auto p-sm">
        {count === 0 ? (
          <p className="px-sm py-lg text-center text-[12.5px] text-on-surface-muted">
            {emptyLabel}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
