import "server-only";
import type { Lang } from "@/lib/i18n/lang";
import { pickTranslation } from "@/lib/i18n/translations";
import { getPromotionStatus } from "@/lib/promotions/status";
import { formatWeeklyHours } from "@/lib/business/opening-hours-format";
import type { OpeningHourWindow } from "@/lib/reservations/availability";
import type { LandingPromotion } from "@/lib/promotions/queries";

const LOCALES: Lang[] = ["en", "es"];

// The offers stage is a fixed four-slot layout (see
// components/marea-landing/marea-landing.css's .ml-offer-pos-1..4) built
// around a centered circular photo, not a reflowing grid — showing more than
// four would either overflow those positions or require redesigning the
// section, which is out of scope here. Featuring is meant to curate a small
// highlight set anyway, the same way testimonials are.
const MAX_OFFERS = 4;

export type LandingOffer = { title: string; tag: string; desc: string };
export type LandingTestimonial = { quote: string; name: string; rating: number | null };
export type LandingAbout = { title: string; body: string };
export type LandingFooterText = { tagline: string; blurb: string; hours: string | null };

export type LandingContent = {
  offers: LandingOffer[];
  testimonials: LandingTestimonial[];
  about: LandingAbout;
  footer: LandingFooterText;
};

export type LandingContentByLang = Record<Lang, LandingContent>;

export type LandingBusinessInfo = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
};

type RawTestimonial = {
  authorName: string;
  rating: number | null;
  translations: { locale: string; quote: string }[];
};
type RawBusinessTranslation = {
  locale: string;
  tagline: string | null;
  shortBlurb: string | null;
  aboutTitle: string | null;
  aboutBody: string | null;
};

function toLandingOffers(promotions: LandingPromotion[], lang: Lang, now: Date): LandingOffer[] {
  return promotions
    .filter((p) => getPromotionStatus(p, now) === "active")
    .slice(0, MAX_OFFERS)
    .map((p) => {
      const t = pickTranslation(p.translations, lang);
      return { title: t?.title ?? "", tag: t?.badgeLabel ?? "", desc: t?.description ?? "" };
    })
    .filter((o) => o.title !== "");
}

function toLandingTestimonials(testimonials: RawTestimonial[], lang: Lang): LandingTestimonial[] {
  return testimonials
    .map((item) => {
      const t = pickTranslation(item.translations, lang);
      return { quote: t?.quote ?? "", name: item.authorName, rating: item.rating };
    })
    .filter((t) => t.quote !== "");
}

/**
 * Everything the landing needs, resolved for both languages up front — the
 * page is a Client Component that switches language client-side with no
 * reload (see MareaLandingPage.tsx), so there's no second server round-trip
 * to resolve the other locale later.
 */
export function toLandingContentByLang(input: {
  promotions: LandingPromotion[];
  testimonials: RawTestimonial[];
  businessTranslations: RawBusinessTranslation[];
  openingHours: OpeningHourWindow[];
  now: Date;
}): LandingContentByLang {
  const byLang = {} as LandingContentByLang;

  for (const lang of LOCALES) {
    const aboutT = pickTranslation(input.businessTranslations, lang);
    byLang[lang] = {
      offers: toLandingOffers(input.promotions, lang, input.now),
      testimonials: toLandingTestimonials(input.testimonials, lang),
      about: { title: aboutT?.aboutTitle ?? "", body: aboutT?.aboutBody ?? "" },
      footer: {
        tagline: aboutT?.tagline ?? "",
        blurb: aboutT?.shortBlurb ?? "",
        hours: formatWeeklyHours(input.openingHours, lang),
      },
    };
  }

  return byLang;
}
