import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage() {
  const lang = await getAdminLang();
  const dict = getDictionary(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-surface-ocean to-surface-subtle p-lg">
      <div className="flex w-full max-w-[360px] flex-col gap-xl">
        <div className="flex flex-col items-center gap-[6px]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary">
            <span className="font-display text-lg font-semibold text-on-primary">
              M
            </span>
          </div>
          <h1 className="font-display text-[22px] font-semibold text-on-surface">
            {dict.auth.title}
          </h1>
          <p className="text-[13px] text-on-surface-muted">
            {dict.auth.subtitle}
          </p>
        </div>

        <div className="rounded-lg bg-surface p-xl shadow-2">
          <LoginForm dict={dict} />
        </div>

        <p className="text-center text-[12px] text-on-surface-muted">
          {dict.auth.noPublicSignup}
        </p>
      </div>
    </div>
  );
}
