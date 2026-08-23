import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const lang = await getAdminLang();
  const dict = getDictionary(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-surface-ocean to-surface-subtle p-lg">
      <div className="flex w-full max-w-[360px] flex-col gap-xl">
        <div className="flex flex-col items-center gap-[6px] text-center">
          <h1 className="font-display text-[22px] font-semibold text-on-surface">
            {dict.auth.mustChangePasswordTitle}
          </h1>
          <p className="text-[13px] text-on-surface-muted">
            {dict.auth.mustChangePasswordBody}
          </p>
        </div>

        <div className="rounded-lg bg-surface p-xl shadow-2">
          <ChangePasswordForm dict={dict} />
        </div>
      </div>
    </div>
  );
}
