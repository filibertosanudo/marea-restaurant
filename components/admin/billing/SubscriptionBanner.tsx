import Link from "next/link";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { DegradeLevel } from "@/lib/billing/degrade";

export type BannerInput = {
  level: DegradeLevel;
  /** The organization's owner: only they get dates and a way to pay. */
  owner: boolean;
  /** Whole days left in the trial, for the owner; null outside one. */
  trialDaysLeft: number | null;
  /** When the next step starts, already formatted in the branch's time zone. */
  nextStepAt: string | null;
};

const TONE: Record<"info" | "warn" | "stop", string> = {
  info: "border-surface-ocean-border bg-surface-ocean",
  warn: "border-warning/40 bg-warning/14",
  stop: "border-error/40 bg-error/10",
};

/**
 * The subscription's state on every admin page: the trial's days left from the
 * first day, then each step of the degrade ladder, louder as it goes. Staff see
 * what changed for them; the owner also sees when the next step comes and how
 * to pay. Nothing for a subscription in good standing.
 */
export function SubscriptionBanner({ dict, input }: { dict: AdminDictionary["billing"]; input: BannerInput }) {
  const { level, owner, trialDaysLeft, nextStepAt } = input;
  let text: string | null = null;
  let tone: keyof typeof TONE = "info";

  if (level === "SUSPENDED") {
    tone = "stop";
    text = dict.degradeSuspended + (owner ? ` ${dict.degradeSuspendedOwner}` : "");
  } else if (level === "READ_ONLY") {
    tone = "warn";
    text = dict.degradeReadOnly + (owner && nextStepAt ? ` ${dict.degradeReadOnlyNext.replace("{date}", nextStepAt)}` : "");
  } else if (level === "WARNING") {
    tone = "warn";
    text = owner && nextStepAt ? dict.degradeWarningOwner.replace("{date}", nextStepAt) : dict.degradeWarningStaff;
  } else if (owner && trialDaysLeft !== null) {
    text = trialDaysLeft <= 1 ? dict.bannerTrialLastDay : dict.bannerTrial.replace("{days}", String(trialDaysLeft));
  }
  if (!text) return null;

  return (
    <div
      role="status"
      className={`mx-lg mt-md flex flex-wrap items-center justify-between gap-md rounded-md border px-md py-sm text-[13px] text-on-surface ${TONE[tone]}`}
    >
      <span>{text}</span>
      {owner && (
        <Link href="/admin/suscripcion" className="font-medium text-primary underline-offset-2 hover:underline">
          {level === "NONE" ? dict.bannerCta : dict.degradeCta}
        </Link>
      )}
    </div>
  );
}
