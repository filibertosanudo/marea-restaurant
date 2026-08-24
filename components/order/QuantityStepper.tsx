"use client";

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  decreaseLabel,
  increaseLabel,
}: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-surface-ocean p-[4px]">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[15px] font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        –
      </button>
      <span className="min-w-[14px] text-center text-[13.5px] font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[15px] font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
