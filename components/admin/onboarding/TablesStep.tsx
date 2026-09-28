"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { createTablesBatchAction, type TableFormState } from "@/lib/tables/actions";
import { advanceOnboardingAction } from "@/lib/onboarding/actions";
import { WizardChrome } from "./WizardChrome";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[12.5px] font-medium text-on-surface";
const fieldClass = "mb-md";

export function TablesStep({ dict }: { dict: AdminDictionary }) {
  const router = useRouter();
  const [skipping, startSkip] = useTransition();
  const [state, formAction, pending] = useActionState<TableFormState, FormData>(createTablesBatchAction, undefined);

  async function goToStep(step: number) {
    await advanceOnboardingAction(step);
    router.push(step > 4 ? "/admin" : `/admin/asistente/${step}`);
  }

  useEffect(() => {
    if (state && "success" in state) goToStep(4);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per successful batch create, not on every render.
  }, [state]);

  return (
    <WizardChrome
      dict={dict.onboarding}
      step={3}
      title={dict.onboarding.tablesTitle}
      lead={dict.onboarding.tablesLead}
      onSkip={() => startSkip(() => goToStep(4))}
      skipping={skipping}
    >
      <form action={formAction} className="rounded-md border border-border bg-surface p-md">
        <div className={fieldClass}>
          <label className={labelClass}>{dict.tables.zoneLabel}</label>
          <input name="zone" placeholder={dict.tables.zonePlaceholder} maxLength={40} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>{dict.tables.quantityLabel}</label>
          <input name="quantity" type="number" defaultValue={4} min={1} max={50} required className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>{dict.tables.seatsPerTableLabel}</label>
          <input name="seats" type="number" defaultValue={4} min={1} max={50} required className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>{dict.tables.codePrefixLabel}</label>
          <input name="codePrefix" defaultValue="M-" required maxLength={10} className={inputClass} />
        </div>

        {state && "error" in state && (
          <p role="alert" className="mb-md text-[13px] text-error">
            {dict.tables.errorGeneric}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {dict.onboarding.continueButton}
        </Button>
      </form>
    </WizardChrome>
  );
}
