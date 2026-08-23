import { auth } from "@/auth";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

// Temporary authenticated landing — replaced by the real AdminShell layout
// and menu screens in the next phases. Its only job right now is to prove
// the auth flow (sign in, JWT session, sign out) end to end.
export default async function AdminHomePage() {
  const session = await auth();
  const lang = await getAdminLang();
  const dict = getDictionary(lang);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-md bg-surface-subtle p-lg text-center">
      <p className="text-[13px] text-on-surface-muted">
        {session?.user?.email} · {session?.user?.role}
      </p>
      <h1 className="font-display text-[22px] font-semibold text-on-surface">
        Marea Admin
      </h1>
      <form action={signOutAction}>
        <Button type="submit" variant="secondary">
          {dict.auth.signOut}
        </Button>
      </form>
    </div>
  );
}
