type ToastVariant = "success" | "warning" | "error" | "info";

type ToastProps = {
  variant?: ToastVariant;
  title: string;
  description?: string;
};

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

export function Toast({ variant = "info", title, description }: ToastProps) {
  return (
    <div className="flex w-[320px] items-start gap-sm rounded-lg bg-surface p-md shadow-2">
      <span className={`mt-[4px] h-[8px] w-[8px] shrink-0 rounded-full ${variantStyles[variant]}`} />
      <div>
        <p className="text-[14px] font-medium text-on-surface">{title}</p>
        {description && (
          <p className="mt-[2px] text-[13px] text-on-surface-muted">{description}</p>
        )}
      </div>
    </div>
  );
}
