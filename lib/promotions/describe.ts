import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { PromotionType } from "@/lib/generated/prisma/client";

type DescribableRule = {
  type: PromotionType;
  value: string;
  code: string | null;
  daysOfWeek: number[];
  startMinute: number | null;
  endMinute: number | null;
  minOrderTotal: string | null;
  maxDiscount: string | null;
};

function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * A day range like Friday-Saturday-Sunday is circular past Saturday (6)
 * into Sunday (0) — plain ascending-run detection would miss it, so this
 * tries every selected day as a starting point for a wrapping sequence.
 */
function daysPhrase(daysOfWeek: number[], dayNames: readonly string[], lang: Lang): string {
  const selected = [...new Set(daysOfWeek)];
  if (selected.length === 0 || selected.length === 7) return "";

  const label = (indices: number[]) =>
    indices.map((i) => (lang === "es" ? dayNames[i].toLowerCase() : dayNames[i]));

  for (const start of selected) {
    const seq = Array.from({ length: selected.length }, (_, i) => (start + i) % 7);
    if (new Set(seq).size === selected.length && seq.every((d) => selected.includes(d))) {
      const names = label(seq);
      if (names.length === 1) return names[0];
      return `${names[0]}${lang === "es" ? " a " : " to "}${names[names.length - 1]}`;
    }
  }

  const names = label([...selected].sort((a, b) => a - b));
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${last}`;
}

/**
 * The natural-language sentence the promotions editor previews live, and
 * the list row's subtitle — "20% off, Friday to Sunday from 18:00 to
 * 22:00, on orders over $300" instead of nine separate fields. See
 * docs/prompts/14's Fase 1: this is the module's central design idea.
 */
export function describePromotion(promo: DescribableRule, dict: AdminDictionary, lang: Lang): string {
  const p = dict.promotions;
  const lead =
    promo.type === "PERCENTAGE"
      ? p.previewPercentage.replace("{value}", promo.value)
      : promo.type === "FIXED_AMOUNT"
        ? p.previewFixed.replace("{value}", promo.value)
        : promo.type === "BUNDLE_PRICE"
          ? p.previewBundle.replace("{value}", promo.value)
          : p.previewFreeItem;

  const parts = [lead];
  const days = daysPhrase(promo.daysOfWeek, dict.settings.dayNames, lang);
  const hasTime = promo.startMinute !== null && promo.endMinute !== null;
  const time = hasTime ? `${minutesToClock(promo.startMinute!)}–${minutesToClock(promo.endMinute!)}` : "";

  if (days && hasTime) parts.push(p.previewDaysAndTime.replace("{days}", days).replace("{time}", time));
  else if (days) parts.push(days);
  else if (hasTime) parts.push(p.previewTimeOnly.replace("{time}", time));

  if (promo.minOrderTotal) parts.push(p.previewMinOrder.replace("{amount}", promo.minOrderTotal));
  // engine.ts caps every discount type at maxDiscount, not just
  // PERCENTAGE — the preview has to say so for all of them, or an admin
  // capping a BUNDLE_PRICE/FREE_ITEM discount would see a bigger number
  // here than checkout will ever actually give away.
  if (promo.maxDiscount) parts.push(p.previewMaxDiscount.replace("{amount}", promo.maxDiscount));

  const sentence = parts.filter(Boolean).join(", ") + ".";
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return promo.code ? `${promo.code.toUpperCase()}: ${capitalized}` : capitalized;
}
