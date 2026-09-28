import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBusinessForRequest } from "@/lib/business";

export default async function AdminHomePage() {
  const session = await auth();

  // Module 19: a business fresh from signup lands here first (STAFF is
  // routed to /admin/menu directly by proxy.ts, so only an admin reaches
  // this page) — send it to the wizard instead of an empty landing screen.
  if (session?.user && !session.user.revoked) {
    const business = await getBusinessForRequest();
    if (!business.onboardingCompletedAt) redirect("/admin/asistente");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[6px] p-lg text-center">
      <h1 className="font-display text-[22px] font-semibold text-on-surface">
        Marea Admin
      </h1>
      <p className="text-[13px] text-on-surface-muted">
        {session?.user?.email} · {session?.user?.role}
      </p>
    </div>
  );
}
