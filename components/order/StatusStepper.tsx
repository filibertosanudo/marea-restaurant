const STEPS = ["PENDING", "PREPARING", "READY", "DELIVERED"] as const;
type Step = (typeof STEPS)[number];

export function StatusStepper({
  status,
  labels,
}: {
  status: Step;
  labels: Record<Step, string>;
}) {
  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="w-full">
      <div className="flex items-center">
        {STEPS.map((step, i) => (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[14px] font-bold ${
                i < currentIndex
                  ? "border-primary bg-primary text-on-primary"
                  : i === currentIndex
                    ? "border-primary text-primary shadow-[0_0_0_5px_rgb(var(--color-primary)/0.14)]"
                    : "border-border/40 bg-surface text-on-surface-muted"
              }`}
            >
              {i < currentIndex ? "✓" : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-[2px] flex-1 ${i < currentIndex ? "bg-primary" : "bg-border/35"}`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-[10px] flex">
        {STEPS.map((step, i) => (
          <span
            key={step}
            className={`flex-1 text-center text-[10.5px] font-medium first:text-left last:text-right ${
              i === currentIndex ? "font-bold text-primary" : "text-on-surface-muted"
            }`}
          >
            {labels[step]}
          </span>
        ))}
      </div>
    </div>
  );
}
