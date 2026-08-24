import "server-only";
import type {
  MenuCategory,
  MenuCategoryTranslation,
  MenuItem,
  MenuItemTranslation,
} from "@/lib/generated/prisma/client";
import { decimalToString } from "@/lib/dto/money";
import type { Lang } from "@/lib/i18n/lang";

const LOCALES: Lang[] = ["en", "es"];

// Mirrors the landing's Dish type (components/marea-landing/content.ts) —
// `img` stays a placeholder label (the dish name), not a real image URL:
// the landing only ever rendered a text Placeholder here, so swapping in a
// real <img> would be a design change, not a data-source change.
type PublicDish = {
  category: string;
  price: string;
  img: string;
  name: string;
  desc: string;
};

type PublicCategory = { id: string; label: string };

export type PublicMenuByLang = Record<Lang, { categories: PublicCategory[]; dishes: PublicDish[] }>;

function formatLandingPrice(basePrice: string): string {
  const n = Number(basePrice);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

type RawCategory = MenuCategory & {
  translations: MenuCategoryTranslation[];
  items: (MenuItem & { translations: MenuItemTranslation[] })[];
};

export function toPublicMenuByLang(categories: RawCategory[]): PublicMenuByLang {
  const byLang = {} as PublicMenuByLang;

  for (const locale of LOCALES) {
    const publicCategories: PublicCategory[] = categories.map((c) => {
      const t = c.translations.find((tr) => tr.locale === locale) ?? c.translations[0];
      return { id: c.slug, label: t?.name ?? c.slug };
    });

    const dishes: PublicDish[] = categories.flatMap((c) =>
      c.items.map((item) => {
        const t = item.translations.find((tr) => tr.locale === locale) ?? item.translations[0];
        const name = t?.name ?? item.slug;
        return {
          category: c.slug,
          price: formatLandingPrice(decimalToString(item.basePrice) ?? "0"),
          img: name,
          name,
          desc: t?.description ?? "",
        };
      })
    );

    byLang[locale] = { categories: publicCategories, dishes };
  }

  return byLang;
}
