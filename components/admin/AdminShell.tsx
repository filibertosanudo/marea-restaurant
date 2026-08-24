"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AdminNavItem } from "./nav-config";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { NAV_ICONS, LockIcon, SearchIcon, MenuBarsIcon, CloseIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { LangSwitch } from "./LangSwitch";
import { UserMenu } from "./UserMenu";

type AdminShellProps = {
  children: ReactNode;
  navItems: AdminNavItem[];
  dict: AdminDictionary;
  lang: Lang;
  user: { name: string; email: string };
};

function SidebarLinks({
  navItems,
  dict,
  pathname,
  onNavigate,
}: {
  navItems: AdminNavItem[];
  dict: AdminDictionary;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-[2px]" aria-label={dict.shell.menuLabel}>
      {navItems.map((item) => {
        const Icon = NAV_ICONS[item.key];
        const active = item.enabled && pathname.startsWith(item.href);
        const label = dict.nav[item.key];

        if (!item.enabled) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              title={dict.nav.comingSoon}
              className="flex cursor-not-allowed items-center gap-[10px] rounded-sm px-[12px] py-[9px] text-[14px] text-on-surface-muted/50"
            >
              <Icon />
              <span className="flex-1">{label}</span>
              <LockIcon />
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-[10px] rounded-sm px-[12px] py-[9px] text-[14px] transition-colors ${
              active
                ? "bg-surface-ocean font-medium text-primary"
                : "text-on-surface-muted hover:bg-surface-subtle hover:text-on-surface"
            }`}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  navItems,
  dict,
  lang,
  user,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      {/* Desktop sidebar */}
      <div className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-surface p-[12px] md:flex">
        <div className="flex items-center gap-[10px] px-[8px] pb-[20px] pt-[8px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-on-primary">
            M
          </span>
          <span className="font-display text-[17px] font-semibold text-on-surface">
            Marea
          </span>
        </div>
        <SidebarLinks navItems={navItems} dict={dict} pathname={pathname} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu backdrop"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
          />
          <div className="absolute left-0 top-0 flex h-full w-[260px] flex-col bg-surface p-[12px] shadow-hero">
            <div className="flex items-center justify-between px-[8px] pb-[20px] pt-[8px]">
              <div className="flex items-center gap-[10px]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-on-primary">
                  M
                </span>
                <span className="font-display text-[17px] font-semibold text-on-surface">
                  Marea
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarLinks
              navItems={navItems}
              dict={dict}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-[20px]">
          <div className="flex items-center gap-[12px]">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={dict.shell.menuLabel}
              className="flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-muted hover:bg-surface-subtle md:hidden"
            >
              <MenuBarsIcon />
            </button>
            <div className="hidden w-[280px] items-center gap-[10px] rounded-sm bg-surface-subtle px-[12px] py-[8px] sm:flex">
              <SearchIcon className="text-on-surface-muted" />
              <span className="text-[13px] text-on-surface-muted">
                {dict.shell.search}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-[14px]">
            <LangSwitch lang={lang} />
            <ThemeToggle
              lightLabel={dict.shell.lightMode}
              darkLabel={dict.shell.darkMode}
            />
            <UserMenu
              name={user.name}
              email={user.email}
              signOutLabel={dict.shell.signOut}
            />
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
