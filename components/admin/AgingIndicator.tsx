"use client";

import { useEffect, useState } from "react";

const WARN_AFTER_MIN = 10;
const HOT_AFTER_MIN = 20;

function elapsedMinutes(placedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000));
}

/**
 * Ticks on its own (no parent re-render needed) so a board full of cards
 * doesn't need a global interval re-rendering everything every second.
 * Color escalates calm -> warn -> hot, but the minute count is always the
 * text — color is never the only signal (H16), which matters doubly here
 * since this reads at three meters where color alone is easy to miss.
 */
export function AgingIndicator({ placedAt, newLabel }: { placedAt: string; newLabel?: string }) {
  const [minutes, setMinutes] = useState(() => elapsedMinutes(placedAt));

  useEffect(() => {
    const id = setInterval(() => setMinutes(elapsedMinutes(placedAt)), 15000);
    return () => clearInterval(id);
  }, [placedAt]);

  const tier = minutes >= HOT_AFTER_MIN ? "hot" : minutes >= WARN_AFTER_MIN ? "warn" : "calm";
  const tierClasses = {
    calm: "bg-info/12 text-info",
    warn: "bg-warning/14 text-warning",
    hot: "bg-error/14 text-error",
  }[tier];
  const dotClasses = { calm: "bg-info", warn: "bg-warning", hot: "bg-error" }[tier];

  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-sm px-[9px] py-[4px] text-[12px] font-bold tabular-nums ${tierClasses}`}
    >
      <span className={`h-[6px] w-[6px] rounded-full ${dotClasses}`} />
      {minutes} min
      {newLabel && minutes < 1 && (
        <span className="ml-[4px] text-[10.5px] font-bold uppercase tracking-wide text-info">
          {newLabel}
        </span>
      )}
    </span>
  );
}
