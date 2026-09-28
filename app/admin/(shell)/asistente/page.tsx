import { redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";

/** Bare /admin/asistente always resumes at the business's own bookmark — never step 1 by default, per module 19's own requirement. */
export default async function OnboardingWizardPage() {
  await requirePageRole("/admin/login", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);
  const business = await getBusinessForRequest();

  if (business.onboardingCompletedAt) redirect("/admin");
  redirect(`/admin/asistente/${business.onboardingStep}`);
}
