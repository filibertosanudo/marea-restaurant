import type { JobStatus, NotificationJob } from "@/lib/generated/prisma/client";

export type NotificationJobDTO = {
  id: string;
  templateKey: string;
  recipientEmail: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

/** recipientPhone, payload, and lockedBy stay out on purpose — the panel shows who a job failed for and why, not the contents of an unsent email or which process happened to hold it. */
export function toNotificationJobDTO(job: NotificationJob): NotificationJobDTO {
  return {
    id: job.id,
    templateKey: job.templateKey,
    recipientEmail: job.recipientEmail,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    createdAt: job.createdAt.toISOString(),
    sentAt: job.sentAt?.toISOString() ?? null,
  };
}
