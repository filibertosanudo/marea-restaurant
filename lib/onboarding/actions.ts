"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getBusinessForRequest, invalidateBusinessCache } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { WIZARD_STEP_COUNT } from "@/lib/onboarding/constants";

/**
 * Bumps the wizard's own bookmark, module 19's answer to "the browser
 * closes on step three, the admin comes back to step three, not one."
 * Called from a step's own client component after its real save action
 * (updateBusinessSettingsAction, updateOpeningHoursAction,
 * createTablesBatchAction, createCategoryAction/createMenuItemAction — this
 * never re-validates any of their data, only tracks progress) already
 * succeeded — never speculatively, and never lower than where the business
 * already was, so revisiting an earlier step to edit it can't rewind
 * progress. `toStep` past WIZARD_STEP_COUNT marks the wizard done.
 */
export async function advanceOnboardingAction(toStep: number): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();

  const nextStep = Math.min(Math.max(business.onboardingStep, toStep), WIZARD_STEP_COUNT);
  const completed = toStep > WIZARD_STEP_COUNT;

  await prisma.business.update({
    where: { id: business.id },
    data: {
      onboardingStep: nextStep,
      ...(completed && !business.onboardingCompletedAt ? { onboardingCompletedAt: new Date() } : {}),
    },
  });

  invalidateBusinessCache(business);
  revalidatePath("/admin/asistente");
  revalidatePath("/admin");
}
