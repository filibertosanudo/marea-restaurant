import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const lang = await getAdminLang();
  const dict = getDictionary(lang);
  // A Server Component runs exactly once per request already — no
  // concurrent-rendering concern the purity rule protects against here —
  // and signupAction's own timing check needs the real render time, not a
  // memoized one.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-surface-ocean to-surface-subtle p-lg">
      <div className="flex w-full max-w-[400px] flex-col gap-xl">
        <div className="flex flex-col items-center gap-[6px] text-center">
          <h1 className="font-display text-[22px] font-semibold text-on-surface">
            {dict.auth.signupTitle}
          </h1>
          <p className="text-[13px] text-on-surface-muted">
            {dict.auth.signupBody}
          </p>
        </div>

        <div className="rounded-lg bg-surface p-xl shadow-2">
          <SignupForm dict={dict} renderedAt={renderedAt} />
        </div>

        <p className="text-center text-[12px] text-on-surface-muted">
          <a href="/admin/login" className="font-medium text-primary underline">
            {dict.auth.backToLogin}
          </a>
        </p>
      </div>
    </div>
  );
}
