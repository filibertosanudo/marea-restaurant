"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { BusinessSettingsForm, type BusinessSettings } from "@/components/admin/settings/BusinessSettingsForm";
import { advanceOnboardingAction } from "@/lib/onboarding/actions";
import { WizardChrome } from "./WizardChrome";

export function BusinessDataStep({ dict, business }: { dict: AdminDictionary; business: BusinessSettings }) {
  const router = useRouter();
  const [skipping, startSkip] = useTransition();

  async function goToStep(step: number) {
    await advanceOnboardingAction(step);
    router.push(step > 4 ? "/admin" : `/admin/asistente/${step}`);
  }

  return (
    <WizardChrome
      dict={dict.onboarding}
      step={1}
      title={dict.onboarding.businessDataTitle}
      lead={dict.onboarding.businessDataLead}
      onSkip={() => startSkip(() => goToStep(2))}
      skipping={skipping}
    >
      <BusinessSettingsForm dict={dict.settings} business={business} onSaved={() => goToStep(2)} />
    </WizardChrome>
  );
}
