import type { Lang } from "@/lib/i18n/lang";
import { decimalToString } from "./money";
import type {
  MenuCategory,
  MenuCategoryTranslation,
  MenuItem,
  MenuItemTranslation,
  Tag,
  TagTranslation,
  ModifierGroup,
  ModifierGroupTranslation,
  ModifierOption,
  ModifierOptionTranslation,
} from "@/lib/generated/prisma/client";

const LOCALES: Lang[] = ["en", "es"];

function translationMap<T extends { locale: string }>(
  translations: T[]
): Record<Lang, T | undefined> {
  const map = {} as Record<Lang, T | undefined>;
  for (const locale of LOCALES) {
    map[locale] = translations.find((t) => t.locale === locale);
  }
  return map;
}

function missingLocales<T extends { locale: string }>(translations: T[]): Lang[] {
  const present = new Set(translations.map((t) => t.locale));
  return LOCALES.filter((l) => !present.has(l));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryListDTO = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  itemCount: number;
  missingLocales: Lang[];
  // Full per-locale text, included so the edit modal can populate instantly
  // from the already-fetched list instead of a second round-trip.
  translations: Record<Lang, { name: string; description: string }>;
};

export function toCategoryListDTO(
  category: MenuCategory & {
    translations: MenuCategoryTranslation[];
    _count: { items: number };
  },
  lang: Lang
): CategoryListDTO {
  const map = translationMap(category.translations);
  return {
    id: category.id,
    slug: category.slug,
    name: map[lang]?.name ?? map.en?.name ?? map.es?.name ?? category.slug,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    itemCount: category._count.items,
    missingLocales: missingLocales(category.translations),
    translations: {
      en: { name: map.en?.name ?? "", description: map.en?.description ?? "" },
      es: { name: map.es?.name ?? "", description: map.es?.description ?? "" },
    },
  };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export type TagDTO = { id: string; slug: string; label: string; color: string | null };

export function toTagDTO(tag: Tag & { translations: TagTranslation[] }, lang: Lang): TagDTO {
  const map = translationMap(tag.translations);
  return {
    id: tag.id,
    slug: tag.slug,
    label: map[lang]?.label ?? map.en?.label ?? tag.slug,
    color: tag.color,
  };
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

type MenuItemWithRelations = MenuItem & {
  translations: MenuItemTranslation[];
  category: MenuCategory & { translations: MenuCategoryTranslation[] };
  tags: { tag: Tag & { translations: TagTranslation[] } }[];
  modifierGroups: { groupId: string }[];
};

// One DTO serves both the table row (name/categoryName/tags at the current
// admin locale) and the edit drawer (full per-locale translations, tagIds,
// modifierGroupIds) — the raw query already joins everything either needs,
// and embedding both means opening the editor never costs a second round
// trip (see the same choice for categories, toCategoryListDTO).
export type MenuItemListDTO = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  basePrice: string;
  compareAtPrice: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  tags: TagDTO[];
  tagIds: string[];
  modifierGroupIds: string[];
  missingLocales: Lang[];
  translations: Record<Lang, { name: string; description: string; imageAlt: string }>;
};

export function toMenuItemListDTO(item: MenuItemWithRelations, lang: Lang): MenuItemListDTO {
  const map = translationMap(item.translations);
  const categoryMap = translationMap(item.category.translations);
  return {
    id: item.id,
    slug: item.slug,
    name: map[lang]?.name ?? map.en?.name ?? map.es?.name ?? item.slug,
    categoryId: item.categoryId,
    categoryName: categoryMap[lang]?.name ?? categoryMap.en?.name ?? item.category.slug,
    basePrice: decimalToString(item.basePrice) ?? "0.00",
    compareAtPrice: decimalToString(item.compareAtPrice),
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    tags: item.tags.map((t) => toTagDTO(t.tag, lang)),
    tagIds: item.tags.map((t) => t.tag.id),
    modifierGroupIds: item.modifierGroups.map((g) => g.groupId),
    missingLocales: missingLocales(item.translations),
    translations: {
      en: {
        name: map.en?.name ?? "",
        description: map.en?.description ?? "",
        imageAlt: map.en?.imageAlt ?? "",
      },
      es: {
        name: map.es?.name ?? "",
        description: map.es?.description ?? "",
        imageAlt: map.es?.imageAlt ?? "",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Modifier groups
// ---------------------------------------------------------------------------

export type ModifierOptionDTO = {
  id: string;
  slug: string;
  name: string;
  priceDelta: string;
  isAvailable: boolean;
  isDefault: boolean;
};

export function toModifierOptionDTO(
  option: ModifierOption & { translations: ModifierOptionTranslation[] },
  lang: Lang
): ModifierOptionDTO {
  const map = translationMap(option.translations);
  return {
    id: option.id,
    slug: option.slug,
    name: map[lang]?.name ?? map.en?.name ?? option.slug,
    priceDelta: decimalToString(option.priceDelta) ?? "0.00",
    isAvailable: option.isAvailable,
    isDefault: option.isDefault,
  };
}

export type ModifierGroupDTO = {
  id: string;
  slug: string;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  options: ModifierOptionDTO[];
  appliedToCount: number;
};

export function toModifierGroupDTO(
  group: ModifierGroup & {
    translations: ModifierGroupTranslation[];
    options: (ModifierOption & { translations: ModifierOptionTranslation[] })[];
    _count: { menuItems: number };
  },
  lang: Lang
): ModifierGroupDTO {
  const map = translationMap(group.translations);
  return {
    id: group.id,
    slug: group.slug,
    name: map[lang]?.name ?? map.en?.name ?? group.slug,
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    options: group.options.map((o) => toModifierOptionDTO(o, lang)),
    appliedToCount: group._count.menuItems,
  };
}
