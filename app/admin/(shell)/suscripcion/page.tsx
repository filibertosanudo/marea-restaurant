import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getSubscriptionSummary } from "@/lib/billing/queries";
import { billingEnabled } from "@/lib/stripe/billing";
import { addCardAction, openPortalAction, reactivateAction, startTrialAction } from "@/lib/billing/actions";
import { NON_PAYING } from "@/lib/billing/degrade";
import { Button } from "@/components/ui/Button";
import { AddBranchForm } from "@/components/admin/billing/AddBranchForm";
import { atBranchLimit, branchAllowance } from "@/lib/billing/limits";

const ARRIVALS = ["card", "started", "error", "reactivated", "declined"] as const;
type Arrival = (typeof ARRIVALS)[number];

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const session = await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN);
  const [business, lang] = await Promise.all([getBusinessForRequest(), getAdminLang()]);
  const dict = getDictionary(lang).billing;
  // The address only says where the owner is arriving from; it never says what Stripe did.
  const { billing } = await searchParams;
  const arrival = ARRIVALS.find((a): a is Arrival => a === billing) ?? null;

  const header = (
    <div>
      <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.title}</h1>
      <p className="mt-[4px] text-[13px] text-on-surface-muted">{dict.lead}</p>
    </div>
  );

  if (!session.user.orgAdmin || !business.organizationId) {
    return (
      <div className="flex flex-col gap-md p-lg">
        {header}
        <p className="text-[13px] text-on-surface-muted">{dict.ownerOnly}</p>
      </div>
    );
  }

  const [summary, allowance] = await Promise.all([getSubscriptionSummary(business.organizationId), branchAllowance(business.organizationId)]);
  // Dates resolved here, in the business's own time zone, never in the browser.
  const date = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { dateStyle: "long", timeZone: business.timezone });
  const fmt = (iso: string | null) => (iso ? date.format(new Date(iso)) : "—");

  const ARRIVAL_TEXT: Record<Arrival, string> = {
    card: dict.arrivalCard,
    started: dict.arrivalStarted,
    error: dict.arrivalError,
    reactivated: dict.arrivalReactivated,
    declined: dict.arrivalDeclined,
  };
  const arrivalText = arrival ? ARRIVAL_TEXT[arrival] : null;
  const notStarted = !summary || summary.status === "NOT_STARTED";
  // Not paying (paused, past due, unpaid, ended): one button that gets it paying again.
  const lapsed = summary !== null && NON_PAYING.has(summary.status);
  const needsCard = summary && !lapsed && !summary.hasPaymentMethod && summary.status === "TRIALING";

  const rows: Array<[string, string]> = summary && !notStarted
    ? [
        [dict.plan, summary.plan ? dict.plans[summary.plan] : "—"],
        [dict.status, dict.statuses[summary.status]],
        ...(summary.plan === "cadena" ? [[dict.branches, String(summary.quantity)] as [string, string]] : []),
        ...(summary.status === "TRIALING" ? [[dict.trialEnds, fmt(summary.trialEndsAt)] as [string, string]] : []),
        ...(summary.status === "ACTIVE" || summary.status === "PAST_DUE"
          ? [[summary.cancelAtPeriodEnd ? dict.endsOn : dict.renews, fmt(summary.currentPeriodEndsAt)] as [string, string]]
          : []),
        [dict.card, summary.hasPaymentMethod ? dict.cardYes : dict.cardNo],
      ]
    : [];

  return (
    <div className="flex max-w-[640px] flex-col gap-md p-lg">
      {header}
      {arrivalText && (
        <p role="status" className="rounded-md border border-border bg-surface-subtle p-md text-[13px] text-on-surface">
          {arrivalText}
        </p>
      )}

      {!billingEnabled() ? (
        <p className="text-[13px] text-on-surface-muted">{dict.notConfigured}</p>
      ) : notStarted ? (
        <div className="flex flex-col items-start gap-md rounded-md border border-border bg-surface p-md">
          <p className="text-[13px] text-on-surface-muted">{dict.noSubscription}</p>
          <form action={startTrialAction}>
            <Button type="submit">{dict.startTrial}</Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-md rounded-md border border-border bg-surface p-md">
          <dl className="grid grid-cols-[auto_1fr] gap-x-lg gap-y-[8px] text-[13px]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-on-surface-muted">{label}</dt>
                <dd className="font-medium text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
          {needsCard && <p className="text-[13px] text-on-surface">{dict.trialNoCard.replace("{date}", fmt(summary.trialEndsAt))}</p>}
          {lapsed && summary.status === "PAUSED" && !summary.hasPaymentMethod && <p className="text-[13px] text-on-surface">{dict.pausedNoCard}</p>}
          <div className="flex flex-wrap items-center gap-md">
            {needsCard && (
              <form action={addCardAction}>
                <Button type="submit">{dict.addCard}</Button>
              </form>
            )}
            {lapsed && (
              <form action={reactivateAction}>
                <Button type="submit">{dict.reactivate}</Button>
              </form>
            )}
            <form action={openPortalAction}>
              <Button type="submit" variant={needsCard || lapsed ? "secondary" : "primary"}>
                {dict.manage}
              </Button>
            </form>
          </div>
          {lapsed && <p className="text-[12px] text-on-surface-muted">{dict.reactivateHint}</p>}
          <p className="text-[12px] text-on-surface-muted">{dict.manageHint}</p>
        </div>
      )}

      <section className="flex flex-col gap-md rounded-md border border-border bg-surface p-md">
        <div>
          <h2 className="text-[15px] font-semibold text-on-surface">{dict.branchesTitle}</h2>
          <p className="text-[13px] text-on-surface-muted">
            {allowance.max === null
              ? dict.branchesCountUnlimited.replace("{count}", String(allowance.count))
              : dict.branchesCount.replace("{count}", String(allowance.count)).replace("{max}", String(allowance.max))}
          </p>
        </div>
        <AddBranchForm
          dict={dict}
          planName={allowance.plan ? dict.plans[allowance.plan] : null}
          max={allowance.max}
          atLimit={atBranchLimit(allowance)}
        />
      </section>
    </div>
  );
}
