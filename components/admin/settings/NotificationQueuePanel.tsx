"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { toIntlLocale } from "@/lib/dto/money";
import type { NotificationJobDTO } from "@/lib/notifications/dto";
import { retryNotificationJobAction } from "@/lib/notifications/admin-actions";

type NotificationsDict = AdminDictionary["settings"]["notifications"];

const BADGE_VARIANT = {
  QUEUED: "neutral",
  PROCESSING: "info",
  SENT: "success",
  FAILED: "error",
  CANCELLED: "neutral",
} as const;

export function NotificationQueuePanel({
  dict,
  lang,
  dueCount,
  jobs,
}: {
  dict: NotificationsDict;
  lang: Lang;
  dueCount: number;
  jobs: NotificationJobDTO[];
}) {
  const [items, setItems] = useState(jobs);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locale = toIntlLocale(lang);
  const statusLabel: Record<NotificationJobDTO["status"], string> = {
    QUEUED: dict.statusQueued,
    PROCESSING: dict.statusProcessing,
    SENT: dict.statusSent,
    FAILED: dict.statusFailed,
    CANCELLED: dict.statusCancelled,
  };

  function handleRetry(jobId: string) {
    setRetryingId(jobId);
    startTransition(async () => {
      await retryNotificationJobAction(jobId);
      setItems((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "QUEUED", attempts: j.attempts } : j)));
      setRetryingId(null);
    });
  }

  return (
    <div>
      <div className="mb-md flex items-center justify-between">
        <div>
          <h2 className="font-display text-[17px] font-semibold text-on-surface">{dict.title}</h2>
          <p className="text-[13px] text-on-surface-muted">{dict.lead}</p>
        </div>
        <div className="rounded-md border border-border bg-surface-subtle px-md py-[8px] text-right">
          <p className="text-[20px] font-semibold text-on-surface">{dueCount}</p>
          <p className="text-[11px] uppercase tracking-[0.04em] text-on-surface-muted">{dict.dueCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnStatus}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnRecipient}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnTemplate}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnAttempts}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnWhen}
              </th>
              <th className="px-md py-[10px]" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-md py-lg text-center text-on-surface-muted">
                  {dict.empty}
                </td>
              </tr>
            )}
            {items.map((job, index) => (
              <tr
                key={job.id}
                className={`border-t border-border align-top ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-md py-[8px]">
                  <StatusBadge variant={BADGE_VARIANT[job.status]}>{statusLabel[job.status]}</StatusBadge>
                  {job.status === "FAILED" && job.lastError && (
                    <p className="mt-[4px] max-w-[240px] text-[12px] text-error" title={job.lastError}>
                      {job.lastError}
                    </p>
                  )}
                </td>
                <td className="px-md py-[8px] text-on-surface-muted">{job.recipientEmail ?? "—"}</td>
                <td className="px-md py-[8px] font-mono text-[12px] text-on-surface-muted">{job.templateKey}</td>
                <td className="px-md py-[8px] text-on-surface-muted">
                  {job.attempts} / {job.maxAttempts}
                </td>
                <td className="px-md py-[8px] text-on-surface-muted">
                  {new Date(job.sentAt ?? job.createdAt).toLocaleString(locale)}
                </td>
                <td className="px-md py-[8px] text-right">
                  {job.status === "FAILED" && (
                    <button
                      type="button"
                      onClick={() => handleRetry(job.id)}
                      disabled={isPending && retryingId === job.id}
                      className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean disabled:opacity-50"
                    >
                      {isPending && retryingId === job.id ? dict.retrying : dict.retry}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
