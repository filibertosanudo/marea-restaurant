"use client";

import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { WIZARD_STEP_COUNT } from "@/lib/onboarding/constants";

type OnboardingDict = AdminDictionary["onboarding"];

/** Presentational shell every wizard step renders inside: progress, title, the step's own content, and a way out that never blocks. */
export function WizardChrome({
  dict,
  step,
  title,
  lead,
  onSkip,
  skipping,
  children,
}: {
  dict: OnboardingDict;
  step: number;
  title: string;
  lead: string;
  onSkip: () => void;
  skipping: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-lg p-lg">
      <div>
        <p className="mb-[4px] text-[12px] font-medium uppercase tracking-wide text-primary">
          {dict.stepLabel.replace("{step}", String(step)).replace("{total}", String(WIZARD_STEP_COUNT))}
        </p>
        <h1 className="font-display text-[20px] font-semibold text-on-surface">{title}</h1>
        <p className="mt-[4px] text-[13px] text-on-surface-muted">{lead}</p>
      </div>

      <div className="flex gap-[4px]">
        {Array.from({ length: WIZARD_STEP_COUNT }, (_, i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 rounded-full ${i < step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {children}

      <button
        type="button"
        onClick={onSkip}
        disabled={skipping}
        className="self-center text-[12.5px] font-medium text-on-surface-muted underline disabled:opacity-50"
      >
        {dict.skipForNow}
      </button>
    </div>
  );
}
