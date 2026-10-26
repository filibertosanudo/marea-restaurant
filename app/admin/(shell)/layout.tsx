import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { navItemsForRole } from "@/components/admin/nav-config";
import { listAccessibleBusinesses } from "@/lib/auth/business-access";
import { AdminShell } from "@/components/admin/AdminShell";
import { SubscriptionBanner, type BannerInput } from "@/components/admin/billing/SubscriptionBanner";
import { getSubscriptionSummary } from "@/lib/billing/queries";
import { degradeStateFor } from "@/lib/billing/degrade-guard";
import { whenLevelStarts } from "@/lib/billing/degrade";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/demo/mode";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts already gates every /admin/* request; this defensive check
  // covers the layout being rendered by anything that bypasses it (a
  // direct RSC fetch, a future route not yet matched, etc.) rather than
  // trusting the edge check alone.
  const session = await getSession();
  if (!session?.user || session.user.revoked) {
    redirect("/admin/login");
  }

  const lang = await getAdminLang();
  const dict = getDictionary(lang);
  const navItems = navItemsForRole(session.user.role, session.user.orgAdmin);
  // What the switcher offers: every business this user may act on, each one
  // re-authorised (lib/auth/business-access.ts).
  const businesses = await listAccessibleBusinesses(session.user.id);
  // The subscription's state (module 19): the trial's end for whoever pays
  // it, from the first day, and the degrade ladder's step for everyone, since
  // a frozen configuration changes what staff can do.
  const owner = session.user.orgAdmin
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
    : null;
  const [subscription, degrade] = await Promise.all([
    owner?.organizationId ? getSubscriptionSummary(owner.organizationId) : null,
    session.user.businessId ? degradeStateFor(session.user.businessId) : null,
  ]);
  let banner: BannerInput | null = null;
  if (degrade && (degrade.level !== "NONE" || subscription)) {
    const next = degrade.level === "WARNING" ? "READ_ONLY" : degrade.level === "READ_ONLY" ? "SUSPENDED" : null;
    const at = next && degrade.lapsedSince ? whenLevelStarts(next, degrade.lapsedSince, degrade.hours, degrade.timezone) : null;
    banner = {
      level: degrade.level,
      owner: Boolean(owner?.organizationId),
      trialDaysLeft: subscription?.trialDaysLeft ?? null,
      // Resolved here, in the branch's own time zone, never in the browser.
      nextStepAt: at
        ? new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { dateStyle: "long", timeStyle: "short", timeZone: degrade.timezone }).format(at)
        : null,
    };
  }

  return (
    <AdminShell
      navItems={navItems}
      dict={dict}
      lang={lang}
      user={{ name: session.user.name ?? "", email: session.user.email }}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      activeBusinessId={session.user.businessId}
      banner={
        <>
          {isDemo() && (
            <div role="note" className="mx-lg mt-md rounded-md border border-border bg-surface-subtle px-md py-sm text-[12.5px] text-on-surface-muted">
              {dict.demo.limits}
            </div>
          )}
          {banner && <SubscriptionBanner dict={dict.billing} input={banner} />}
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
