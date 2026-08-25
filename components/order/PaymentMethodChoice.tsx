"use client";

export type PaymentMethod = "CARD" | "CASH_REGISTER";

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

function ChoiceCard({
  selected,
  focusable,
  onSelect,
  onKeyDown,
  title,
  body,
  disabled,
}: {
  selected: boolean;
  focusable: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  title: string;
  body: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
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
 * radio input would — including arrow-key selection between the two
 * (Tab reaches one stop in the group, not two, per the ARIA radio pattern).
 */
export function PaymentMethodChoice({
  value,
  onChange,
  groupLabel,
  cardTitle,
  cardBody,
  cashTitle,
  cashBody,
  disabled,
}: {
  value: PaymentMethod | null;
  onChange: (value: PaymentMethod) => void;
  /** Accessible name for the radiogroup as a whole — e.g. "How do you want to pay?", never one option's own title. */
  groupLabel: string;
  cardTitle: string;
  cardBody: string;
  cashTitle: string;
  cashBody: string;
  disabled?: boolean;
}) {
  // With nothing chosen yet, the first card is the group's one tab stop —
  // same "roving tabindex lands on the first option" convention a native
  // radio group with no checked input follows.
  const rovingValue = value ?? "CARD";

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, other: PaymentMethod) {
    if (!ARROW_KEYS.has(e.key)) return;
    e.preventDefault();
    onChange(other);
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    for (const button of buttons ?? []) {
      if (button !== e.currentTarget) {
        button.focus();
        break;
      }
    }
  }

  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-col gap-sm">
      <ChoiceCard
        selected={value === "CARD"}
        focusable={rovingValue === "CARD"}
        onSelect={() => onChange("CARD")}
        onKeyDown={(e) => handleKeyDown(e, "CASH_REGISTER")}
        title={cardTitle}
        body={cardBody}
        disabled={disabled}
      />
      <ChoiceCard
        selected={value === "CASH_REGISTER"}
        focusable={rovingValue === "CASH_REGISTER"}
        onSelect={() => onChange("CASH_REGISTER")}
        onKeyDown={(e) => handleKeyDown(e, "CARD")}
        title={cashTitle}
        body={cashBody}
        disabled={disabled}
      />
    </div>
  );
}
