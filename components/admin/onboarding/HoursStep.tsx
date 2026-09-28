"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { ScheduleEditor, type OpeningHourRow, type ClosureRow } from "@/components/admin/settings/ScheduleEditor";
import { advanceOnboardingAction } from "@/lib/onboarding/actions";
import { WizardChrome } from "./WizardChrome";

export function HoursStep({
  dict,
  lang,
  timezone,
  openingHours,
  closures,
}: {
  dict: AdminDictionary;
  lang: Lang;
  timezone: string;
  openingHours: OpeningHourRow[];
  closures: ClosureRow[];
}) {
  const router = useRouter();
  const [skipping, startSkip] = useTransition();

  async function goToStep(step: number) {
    await advanceOnboardingAction(step);
    router.push(step > 4 ? "/admin" : `/admin/asistente/${step}`);
  }

  return (
    <WizardChrome
      dict={dict.onboarding}
      step={2}
      title={dict.onboarding.hoursTitle}
      lead={dict.onboarding.hoursLead}
      onSkip={() => startSkip(() => goToStep(3))}
      skipping={skipping}
    >
      <ScheduleEditor
        dict={dict.settings}
        lang={lang}
        timezone={timezone}
        openingHours={openingHours}
        closures={closures}
        onSaved={() => goToStep(3)}
      />
    </WizardChrome>
  );
}
