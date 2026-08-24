import Link from "next/link";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

type MenuSection = "items" | "categories" | "modifiers";

export function MenuSectionTabs({
  active,
  dict,
}: {
  active: MenuSection;
  dict: AdminDictionary;
}) {
  const tabs: { key: MenuSection; href: string; label: string }[] = [
    { key: "items", href: "/admin/menu", label: dict.shell.dishes },
    { key: "categories", href: "/admin/menu/categorias", label: dict.shell.categories },
    { key: "modifiers", href: "/admin/menu/modificadores", label: dict.shell.modifiers },
  ];

  return (
    <div className="flex gap-[4px] border-b border-border px-lg pt-md">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-t-sm px-[14px] py-[8px] text-[13px] font-medium transition-colors ${
            active === tab.key
              ? "border-b-2 border-primary text-primary"
              : "text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
