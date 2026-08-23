"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";

type Theme = "light" | "dark";

export function ThemeToggle({
  lightLabel,
  darkLabel,
}: {
  lightLabel: string;
  darkLabel: string;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // One-time read of a browser-only API (localStorage) to sync the icon
    // with the theme the flash-fix script in app/layout.tsx already applied
    // to <html> before hydration — there's no SSR-safe way to know this
    // value during the initial render, so this can't be a lazy useState
    // initializer without breaking hydration instead.
    const stored = localStorage.getItem("marea-theme") as Theme | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("marea-theme", theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? lightLabel : darkLabel}
      title={isDark ? lightLabel : darkLabel}
      className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted transition-colors hover:bg-surface-subtle hover:text-on-surface"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
