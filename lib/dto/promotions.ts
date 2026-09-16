import type { Lang } from "@/lib/i18n/lang";
import { decimalToString } from "./money";
import type {
  Promotion,
  PromotionTranslation,
  OrderType,
  PromotionType,
} from "@/lib/generated/prisma/client";
import type { PromotionRule } from "@/lib/promotions/engine";

const LOCALES: Lang[] = ["en", "es"];

function translationMap<T extends { locale: string }>(translations: T[]): Record<Lang, T | undefined> {
  const map = {} as Record<Lang, T | undefined>;
  for (const locale of LOCALES) map[locale] = translations.find((t) => t.locale === locale);
  return map;
}

function missingLocales<T extends { locale: string }>(translations: T[]): Lang[] {
  const present = new Set(translations.map((t) => t.locale));
  return LOCALES.filter((l) => !present.has(l));
}

type PromotionWithRelations = Promotion & {
  translations: PromotionTranslation[];
  menuItems: { menuItemId: string }[];
};

export type PromotionListDTO = {
  id: string;
  slug: string;
  type: PromotionType;
  code: string | null;
  value: string;
  minOrderTotal: string | null;
  maxDiscount: string | null;
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: number[];
  startMinute: number | null;
  endMinute: number | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number | null;
  appliesToOrderType: OrderType | null;
  isActive: boolean;
  isFeatured: boolean;
  menuItemIds: string[];
  missingLocales: Lang[];
  title: string;
  /** engine.ts's applyPromotions sorts automatic promotions by this for a deterministic stacking order — carried through so a future checkout hookup doesn't need a second query just to get it. */
  createdAt: string;
  translations: Record<Lang, { title: string; description: string; badgeLabel: string }>;
};

export function toPromotionListDTO(promo: PromotionWithRelations, lang: Lang): PromotionListDTO {
  const map = translationMap(promo.translations);
  return {
    id: promo.id,
    slug: promo.slug,
    type: promo.type,
    code: promo.code,
    value: decimalToString(promo.value) ?? "0.00",
    minOrderTotal: decimalToString(promo.minOrderTotal),
    maxDiscount: decimalToString(promo.maxDiscount),
    startsAt: promo.startsAt?.toISOString() ?? null,
    endsAt: promo.endsAt?.toISOString() ?? null,
    daysOfWeek: promo.daysOfWeek,
    startMinute: promo.startMinute,
    endMinute: promo.endMinute,
    usageLimit: promo.usageLimit,
    usageCount: promo.usageCount,
    perUserLimit: promo.perUserLimit,
    appliesToOrderType: promo.appliesToOrderType,
    isActive: promo.isActive,
    isFeatured: promo.isFeatured,
    menuItemIds: promo.menuItems.map((m) => m.menuItemId),
    missingLocales: missingLocales(promo.translations),
    title: map[lang]?.title ?? map.en?.title ?? map.es?.title ?? promo.slug,
    createdAt: promo.createdAt.toISOString(),
    translations: {
      en: {
        title: map.en?.title ?? "",
        description: map.en?.description ?? "",
        badgeLabel: map.en?.badgeLabel ?? "",
      },
      es: {
        title: map.es?.title ?? "",
        description: map.es?.description ?? "",
        badgeLabel: map.es?.badgeLabel ?? "",
      },
    },
  };
}

/**
 * The checkout-side mapping, unlike toPromotionListDTO above: stays
 * server-side (never crosses to a Client Component) so amounts keep
 * Prisma.Decimal instead of being stringified, matching what
 * lib/promotions/engine.ts's pure arithmetic expects.
 */
export function toPromotionRule(promo: PromotionWithRelations): PromotionRule {
  return {
    id: promo.id,
    type: promo.type,
    code: promo.code,
    value: promo.value,
    minOrderTotal: promo.minOrderTotal,
    maxDiscount: promo.maxDiscount,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    daysOfWeek: promo.daysOfWeek,
    startMinute: promo.startMinute,
    endMinute: promo.endMinute,
    usageLimit: promo.usageLimit,
    perUserLimit: promo.perUserLimit,
    appliesToOrderType: promo.appliesToOrderType,
    isActive: promo.isActive,
    createdAt: promo.createdAt,
    menuItemIds: promo.menuItems.map((m) => m.menuItemId),
  };
}
