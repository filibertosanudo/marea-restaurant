import type { ReservationStatus } from "@/lib/generated/prisma/client";

type Variant = "neutral" | "info" | "success" | "warning";

/**
 * The same semantic mapping the approved Fase 2 agenda design uses, reused
 * here for the public lookup page instead of inventing a second one:
 * neutral for what doesn't need anyone's attention yet (PENDING, CANCELLED),
 * info for confirmed-but-not-here-yet, success for SEATED and COMPLETED
 * alike (neither is a problem — the only difference is whether the table
 * has been freed), and warning for the one status that actually needs a
 * human to notice it, NO_SHOW.
 */
const VARIANT_BY_STATUS: Record<ReservationStatus, Variant> = {
  PENDING: "neutral",
  CONFIRMED: "info",
  SEATED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "warning",
};

const COLOR_CLASSES: Record<Variant, string> = {
  neutral: "bg-border/16 text-on-surface-muted",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
};

/** Same tint-on-semantic-color pattern as PaymentStatusPill, applied to ReservationStatus's six values instead of Payment's eight — kept as its own component because the vocabularies don't overlap (a reservation is never "requires_action"), same reasoning PaymentStatusPill's own doc comment gives for not sharing with StatusBadge. */
export function ReservationStatusBadge({
  status,
  label,
  className = "rounded-sm px-sm py-[3px] text-[12px] font-semibold",
}: {
  status: ReservationStatus;
  label: string;
  className?: string;
}) {
  return <span className={`${COLOR_CLASSES[VARIANT_BY_STATUS[status]]} ${className}`}>{label}</span>;
}
