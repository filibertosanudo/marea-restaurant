import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { navItemsForRole } from "@/components/admin/nav-config";
import { AdminShell } from "@/components/admin/AdminShell";

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
  const navItems = navItemsForRole(session.user.role);

  return (
    <AdminShell
      navItems={navItems}
      dict={dict}
      lang={lang}
      user={{ name: session.user.name ?? "", email: session.user.email }}
    >
      {children}
    </AdminShell>
  );
}
