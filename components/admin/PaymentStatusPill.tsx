export type PaymentStatusValue =
  | "PENDING"
  | "PROCESSING"
  | "REQUIRES_ACTION"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

type Variant = "success" | "warning" | "error" | "info" | "neutral";

// Same semantic mapping StatusBadge uses for order status, applied to the
// payment lifecycle. PROCESSING/REQUIRES_ACTION get `info`/`warning` (not
// `neutral`) because — unlike a plain "not paid yet" PENDING — they're
// mid-flight states a person might need to act on or wait through, and
// color is the first thing that differentiates "hasn't started" from
// "actively happening" at a glance.
const VARIANT_BY_STATUS: Record<PaymentStatusValue, Variant> = {
  PENDING: "neutral",
  PROCESSING: "info",
  REQUIRES_ACTION: "warning",
  SUCCEEDED: "success",
  FAILED: "error",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "warning",
};

const COLOR_CLASSES: Record<Variant, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
  neutral: "bg-border/16 text-on-surface-muted",
};

const DOT_CLASSES: Record<Variant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  neutral: "bg-on-surface-muted",
};

/**
 * The one place a PaymentStatus becomes a color + label, so the same
 * status never reads as "paid" in one surface and "pending" in another —
 * used today by the payment drawer's history list (both a payment's own
 * status and, per refund row, its RefundStatus). `className` overrides
 * size/padding only (never color), the same pattern OrderCard's density
 * variant and AgingIndicator already use, for whichever future surface
 * (the board card's own badge stays its own simpler due/paid distinction
 * for now — see OrderCard.tsx) needs a different scale than the drawer's.
 */
export function PaymentStatusPill({
  status,
  label,
  className = "rounded-sm px-sm py-[3px] text-[11px]",
  showDot = false,
}: {
  status: PaymentStatusValue;
  label: string;
  className?: string;
  showDot?: boolean;
}) {
  const variant = VARIANT_BY_STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-[6px] font-semibold ${COLOR_CLASSES[variant]} ${className}`}
    >
      {showDot && <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${DOT_CLASSES[variant]}`} />}
      {label}
    </span>
  );
}
