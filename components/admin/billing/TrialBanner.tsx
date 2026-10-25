import Link from "next/link";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { SubscriptionSummary } from "@/lib/billing/queries";

/**
 * The trial's end, visible from the first day on every page the owner opens,
 * and a paused subscription the same way. Nothing for any other state: an
 * active subscription needs no reminder.
 */
export function TrialBanner({ dict, summary }: { dict: AdminDictionary["billing"]; summary: SubscriptionSummary }) {
  let text: string | null = null;
  if (summary.status === "TRIALING" && summary.trialDaysLeft !== null) {
    text = summary.trialDaysLeft <= 1 ? dict.bannerTrialLastDay : dict.bannerTrial.replace("{days}", String(summary.trialDaysLeft));
  } else if (summary.status === "PAUSED") {
    text = dict.bannerPaused;
  }
  if (!text) return null;

  return (
    <div
      role="status"
      className="mx-lg mt-md flex flex-wrap items-center justify-between gap-md rounded-md border border-surface-ocean-border bg-surface-ocean px-md py-sm text-[13px] text-on-surface"
    >
      <span>{text}</span>
      <Link href="/admin/suscripcion" className="font-medium text-primary underline-offset-2 hover:underline">
        {dict.bannerCta}
      </Link>
    </div>
  );
}
