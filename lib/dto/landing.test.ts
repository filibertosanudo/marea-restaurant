import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toLandingContentByLang } from "./landing";
import type {
  Promotion,
  PromotionTranslation,
  Testimonial,
  TestimonialTranslation,
  BusinessTranslation,
} from "@/lib/generated/prisma/client";

const NOW = new Date("2026-09-16T12:00:00Z");

function promotion(overrides: Partial<Promotion> = {}, translations: PromotionTranslation[] = []) {
  const base: Promotion = {
    id: "promo-1",
    businessId: "biz-1",
    slug: "promo-1",
    type: "PERCENTAGE",
    code: null,
    value: new Prisma.Decimal("20"),
    minOrderTotal: null,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    daysOfWeek: [],
    startMinute: null,
    endMinute: null,
    usageLimit: null,
    usageCount: 0,
    perUserLimit: null,
    appliesToOrderType: null,
    imageUrl: null,
    isActive: true,
    isFeatured: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
  return { ...base, ...overrides, translations };
}

function promoTranslation(overrides: Partial<PromotionTranslation> = {}): PromotionTranslation {
  return {
    id: "pt-1",
    promotionId: "promo-1",
    locale: "en",
    title: "Lobster Night",
    description: "50% off Thursdays",
    badgeLabel: "50% OFF",
    ...overrides,
  };
}

function testimonial(overrides: Partial<Testimonial> = {}, translations: TestimonialTranslation[] = []) {
  const base: Testimonial = {
    id: "t-1",
    businessId: "biz-1",
    authorId: null,
    authorName: "Sofia Ramirez",
    authorTitle: null,
    avatarUrl: null,
    rating: 5,
    orderId: null,
    sourceLocale: "en",
    status: "APPROVED",
    isFeatured: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
  return { ...base, ...overrides, translations };
}

function testimonialTranslation(overrides: Partial<TestimonialTranslation> = {}): TestimonialTranslation {
  return {
    id: "tt-1",
    testimonialId: "t-1",
    locale: "en",
    quote: "Loved it",
    ...overrides,
  };
}

function businessTranslation(overrides: Partial<BusinessTranslation> = {}): BusinessTranslation {
  return {
    id: "bt-1",
    businessId: "biz-1",
    locale: "en",
    tagline: "Fresh from the ocean, every day.",
    shortBlurb: "Boutique seafood, sourced daily.",
    aboutTitle: "Fresh from local waters, daily.",
    aboutBody: "Fresh, delicately prepared seafood.",
    metaTitle: null,
    metaDescription: null,
    ...overrides,
  };
}

describe("toLandingContentByLang", () => {
  it("returns empty offers and testimonials when there's nothing to show", () => {
    const result = toLandingContentByLang({
      promotions: [],
      testimonials: [],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.offers).toEqual([]);
    expect(result.en.testimonials).toEqual([]);
    expect(result.en.about).toEqual({ title: "", body: "" });
    expect(result.en.footer.hours).toBeNull();
  });

  it("excludes a promotion whose campaign window already expired", () => {
    const expired = promotion(
      { endsAt: new Date("2026-01-01") },
      [promoTranslation()]
    );

    const result = toLandingContentByLang({
      promotions: [expired],
      testimonials: [],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.offers).toEqual([]);
  });

  it("excludes an inactive or exhausted promotion", () => {
    const inactive = promotion({ id: "p1", isActive: false }, [promoTranslation({ promotionId: "p1" })]);
    const exhausted = promotion(
      { id: "p2", usageLimit: 10, usageCount: 10 },
      [promoTranslation({ promotionId: "p2" })]
    );

    const result = toLandingContentByLang({
      promotions: [inactive, exhausted],
      testimonials: [],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.offers).toEqual([]);
  });

  it("includes a currently active featured promotion with its translation", () => {
    const active = promotion({}, [promoTranslation()]);

    const result = toLandingContentByLang({
      promotions: [active],
      testimonials: [],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.offers).toEqual([{ title: "Lobster Night", tag: "50% OFF", desc: "50% off Thursdays" }]);
  });

  it("caps offers at four, keeping sortOrder order", () => {
    const promotions = Array.from({ length: 6 }, (_, i) =>
      promotion(
        { id: `p${i}`, sortOrder: i },
        [promoTranslation({ promotionId: `p${i}`, title: `Offer ${i}` })]
      )
    );

    const result = toLandingContentByLang({
      promotions,
      testimonials: [],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.offers).toHaveLength(4);
    expect(result.en.offers.map((o) => o.title)).toEqual(["Offer 0", "Offer 1", "Offer 2", "Offer 3"]);
  });

  it("falls back to whatever translation exists when a testimonial has no quote in the requested language", () => {
    const item = testimonial({ sourceLocale: "es" }, [testimonialTranslation({ locale: "es", quote: "Excelente" })]);

    const result = toLandingContentByLang({
      promotions: [],
      testimonials: [item],
      businessTranslations: [],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.testimonials).toEqual([{ quote: "Excelente", name: "Sofia Ramirez", rating: 5 }]);
    expect(result.es.testimonials).toEqual([{ quote: "Excelente", name: "Sofia Ramirez", rating: 5 }]);
  });

  it("resolves about and footer text per language, independently", () => {
    const result = toLandingContentByLang({
      promotions: [],
      testimonials: [],
      businessTranslations: [
        businessTranslation({ locale: "en", aboutTitle: "English title" }),
        businessTranslation({ locale: "es", aboutTitle: "Título en español" }),
      ],
      openingHours: [],
      now: NOW,
    });

    expect(result.en.about.title).toBe("English title");
    expect(result.es.about.title).toBe("Título en español");
  });
});
