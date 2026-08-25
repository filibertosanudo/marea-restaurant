"use client";

export type PaymentMethod = "CARD" | "CASH_REGISTER";

function ChoiceCard({
  selected,
  onSelect,
  title,
  body,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-start gap-md rounded-lg border-2 p-md text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-primary bg-surface-ocean"
          : "border-border/30 bg-surface hover:border-border/60"
      }`}
    >
      <span
        aria-hidden
        className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-primary" : "border-border/50"
        }`}
      >
        {selected && <span className="h-[10px] w-[10px] rounded-full bg-primary" />}
      </span>
      <span>
        <span className="block text-[14.5px] font-semibold text-on-surface">{title}</span>
        <span className="mt-[2px] block text-[12.5px] text-on-surface-muted">{body}</span>
      </span>
    </button>
  );
}

/**
 * The order-tracking page's first payment decision: card now, or pay at
 * the register. A radiogroup of two big tap targets, not a dropdown —
 * this is read once on a phone right after ordering, not a form field
 * filled out repeatedly. `role="radiogroup"`/`role="radio"` so screen
 * readers announce it as the single choice it is, matching how a native
 * radio input would.
 */
export function PaymentMethodChoice({
  value,
  onChange,
  cardTitle,
  cardBody,
  cashTitle,
  cashBody,
  disabled,
}: {
  value: PaymentMethod | null;
  onChange: (value: PaymentMethod) => void;
  cardTitle: string;
  cardBody: string;
  cashTitle: string;
  cashBody: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="flex flex-col gap-sm">
      <ChoiceCard
        selected={value === "CARD"}
        onSelect={() => onChange("CARD")}
        title={cardTitle}
        body={cardBody}
        disabled={disabled}
      />
      <ChoiceCard
        selected={value === "CASH_REGISTER"}
        onSelect={() => onChange("CASH_REGISTER")}
        title={cashTitle}
        body={cashBody}
        disabled={disabled}
      />
    </div>
  );
}
