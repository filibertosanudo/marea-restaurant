import "server-only";
import type {
  MenuCategory,
  MenuCategoryTranslation,
  MenuItem,
  MenuItemTranslation,
  Tag,
  TagTranslation,
  MenuItemModifierGroup,
  ModifierGroup,
  ModifierGroupTranslation,
  ModifierOption,
  ModifierOptionTranslation,
} from "@/lib/generated/prisma/client";
import { decimalToString } from "@/lib/dto/money";
import type { Lang } from "@/lib/i18n/lang";

const LOCALES: Lang[] = ["en", "es"];

export type PublicModifierOption = {
  id: string;
  name: string;
  priceDelta: string;
  isAvailable: boolean;
  isDefault: boolean;
};

export type PublicModifierGroup = {
  id: string;
  name: string;
  helpText: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  options: PublicModifierOption[];
};

export type PublicTag = { id: string; slug: string; label: string; color: string | null };

// Mirrors the landing's Dish type (components/marea-landing/content.ts) —
// `img` stays a placeholder label (the dish name), not a real image URL:
// the landing only ever rendered a text Placeholder here, so swapping in a
// real <img> would be a design change, not a data-source change. Extended
// (not replaced) with what the order flow needs: id to add to cart, and
// modifiers/tags for the detail sheet — Dish/PublicMenuByLang consumers
// that only read the original fields are unaffected.
export type PublicDish = {
  id: string;
  category: string;
  price: string;
  /** Raw "42.00" the landing's pre-formatted `price` ("$42") derives from — for callers that need Intl.NumberFormat currency formatting instead. */
  priceValue: string;
  compareAtPrice: string | null;
  img: string;
  name: string;
  desc: string;
  tags: PublicTag[];
  modifierGroups: PublicModifierGroup[];
};

export type PublicCategory = { id: string; label: string };

export type PublicMenuByLang = Record<Lang, { categories: PublicCategory[]; dishes: PublicDish[] }>;

function formatLandingPrice(basePrice: string): string {
  const n = Number(basePrice);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

type RawModifierGroup = ModifierGroup & {
  translations: ModifierGroupTranslation[];
  options: (ModifierOption & { translations: ModifierOptionTranslation[] })[];
};

export function toPublicModifierGroup(group: RawModifierGroup, locale: Lang): PublicModifierGroup {
  const t = group.translations.find((tr) => tr.locale === locale) ?? group.translations[0];
  return {
    id: group.id,
    name: t?.name ?? group.slug,
    helpText: t?.helpText ?? "",
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    options: group.options.map((o) => {
      const ot = o.translations.find((tr) => tr.locale === locale) ?? o.translations[0];
      return {
        id: o.id,
        name: ot?.name ?? o.slug,
        priceDelta: decimalToString(o.priceDelta) ?? "0.00",
        isAvailable: o.isAvailable,
        isDefault: o.isDefault,
      };
    }),
  };
}

type RawItem = MenuItem & {
  translations: MenuItemTranslation[];
  tags: { tag: Tag & { translations: TagTranslation[] } }[];
  modifierGroups: (MenuItemModifierGroup & { group: RawModifierGroup })[];
};

type RawCategory = MenuCategory & {
  translations: MenuCategoryTranslation[];
  items: RawItem[];
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
          id: item.id,
          category: c.slug,
          price: formatLandingPrice(decimalToString(item.basePrice) ?? "0"),
          priceValue: decimalToString(item.basePrice) ?? "0.00",
          compareAtPrice: decimalToString(item.compareAtPrice),
          img: name,
          name,
          desc: t?.description ?? "",
          tags: item.tags.map(({ tag }) => {
            const tt = tag.translations.find((tr) => tr.locale === locale) ?? tag.translations[0];
            return { id: tag.id, slug: tag.slug, label: tt?.label ?? tag.slug, color: tag.color };
          }),
          modifierGroups: item.modifierGroups.map((mg) => toPublicModifierGroup(mg.group, locale)),
        };
      })
    );

    byLang[locale] = { categories: publicCategories, dishes };
  }

  return byLang;
}
