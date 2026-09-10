import type { ReactNode } from "react";

/**
 * A grid, not a vertical list — a Friday-night column of 15 orders has to
 * fit without scrolling (the module's own requirement: the oldest order,
 * which needs the most attention, can't be the one that scrolls out of
 * view). `auto-fill` lets the column pack as many card-widths as the
 * screen has room for and wrap into rows, instead of one card per row.
 */
export function KitchenColumn({
  title,
  count,
  children,
  emptyLabel,
}: {
  title: string;
  count: number;
  children: ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface-subtle">
      <div className="flex flex-none items-center justify-between px-[14px] py-[8px]">
        <span className="text-[16px] font-bold uppercase tracking-wide text-on-surface-muted">{title}</span>
        <span className="rounded-md bg-border/20 px-[10px] py-[2px] font-display text-[17px] font-extrabold tabular-nums text-on-surface">
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-[6px] pb-[6px]">
        {count === 0 ? (
          <p className="py-[40px] text-center text-[18px] text-on-surface-muted">{emptyLabel}</p>
        ) : (
          // 220px, not something rounder like 300: three columns on a
          // 1920px TV leave ~600px per column after padding/gaps, and a
          // wider minimum would round back down to a single track there —
          // defeating the entire point of a grid over a vertical list.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[6px]">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
