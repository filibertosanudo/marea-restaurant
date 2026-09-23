"use client";

/**
 * The end of a column that holds more cards than it shows. `remaining` is how
 * many are still on the server; the label comes from the dictionary
 * ("Ver más ({count})"). The kitchen size is for a TV read from across the room.
 */
export function LoadMoreButton({
  label,
  remaining,
  loading,
  onClick,
  size,
}: {
  label: string;
  remaining: number;
  loading: boolean;
  onClick: () => void;
  size: "kitchen" | "waiter";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full rounded-md border border-border/40 font-semibold text-on-surface-muted transition-colors hover:bg-surface disabled:opacity-50 ${
        size === "kitchen" ? "min-h-[48px] text-[18px]" : "min-h-[40px] text-[13px]"
      }`}
    >
      {label.replace("{count}", String(remaining))}
    </button>
  );
}
