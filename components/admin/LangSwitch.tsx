"use client";

import { useTransition } from "react";
import { setAdminLangAction } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n/lang";

export function LangSwitch({ lang }: { lang: Lang }) {
  const [pending, startTransition] = useTransition();

  function pick(next: Lang) {
    if (next === lang || pending) return;
    startTransition(async () => {
      await setAdminLangAction(next);
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex gap-[3px] rounded-full bg-surface-subtle p-[3px]"
    >
      {(["en", "es"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          aria-pressed={lang === code}
          className={`rounded-full px-[11px] py-[5px] text-[12px] font-medium transition-colors ${
            lang === code
              ? "bg-primary text-on-primary"
              : "text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
