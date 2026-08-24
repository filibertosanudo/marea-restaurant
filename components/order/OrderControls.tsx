"use client";

import { useEffect, useState, useTransition } from "react";
import { setOrderLangAction } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n/lang";

type Theme = "light" | "dark";

/**
 * Same mechanism as the rest of the app: `marea-theme` in localStorage +
 * `data-theme` on <html> (the flash-fix script in app/layout.tsx already
 * applies it before hydration), so toggling here matches the landing and
 * admin panel instead of inventing a third theme system for this flow.
 * Language is different here: this flow is server-rendered (dish names come
 * from the DB per request), so switching writes the `marea-order-lang`
 * cookie and lets the Server Action's revalidation re-render from the server.
 */
export function OrderControls({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (document.documentElement.getAttribute("data-theme") === "dark") setTheme("dark");
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("marea-theme", next);
  }

  function pickLang(next: Lang) {
    if (next === lang || pending) return;
    startTransition(async () => {
      await setOrderLangAction(next);
    });
  }

  return (
    <div className="flex items-center gap-[6px]">
      <div role="group" aria-label="Language" className="flex gap-[2px] rounded-full bg-surface-subtle p-[3px]">
        {(["es", "en"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => pickLang(code)}
            aria-pressed={lang === code}
            className={`rounded-full px-[9px] py-[4px] text-[11px] font-semibold transition-colors ${
              lang === code ? "bg-primary text-on-primary" : "text-on-surface-muted"
            }`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
      >
        {theme === "dark" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
