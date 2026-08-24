type StatusBadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
  neutral: "bg-border/16 text-on-surface-muted",
};

export function StatusBadge({
  variant,
  children,
}: {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-[10px] py-[3px] text-[11px] font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
