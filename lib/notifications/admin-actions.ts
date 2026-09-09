"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { UserRole } from "@/lib/generated/prisma/client";
import { retryJob } from "@/lib/notifications/queue";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

/** Manual retry from the queue panel — moves a FAILED job back to QUEUED so the next poll picks it up. A no-op (not an error) if the job isn't FAILED anymore, e.g. two admins click retry at once. */
export async function retryNotificationJobAction(jobId: string): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await retryJob(jobId, business.id);
  revalidatePath("/admin/configuracion");
}
