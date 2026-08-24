import type { ReactNode } from "react";

export function KanbanColumn({
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
    <div className="flex min-w-0 flex-col bg-surface-subtle">
      <div className="flex flex-none items-center justify-between bg-surface px-md py-[14px]">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-on-surface-muted">
          {title}
        </span>
        <span className="rounded-sm bg-border/16 px-sm py-[2px] font-display text-[15px] font-bold tabular-nums text-on-surface">
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
