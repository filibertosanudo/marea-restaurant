import type { Testimonial, TestimonialTranslation } from "@/lib/generated/prisma/client";

type TestimonialWithTranslations = Testimonial & { translations: TestimonialTranslation[] };

export type TestimonialModerationDTO = {
  id: string;
  authorName: string;
  rating: number | null;
  quote: string;
  sourceLocale: string;
  isVerified: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
};

/** The moderation queue never edits a customer's words — this only ever reads the quote back in the language it was written in, never resolved against a viewer's locale the way the public landing DTO will. */
export function toTestimonialModerationDTO(testimonial: TestimonialWithTranslations): TestimonialModerationDTO {
  const own = testimonial.translations.find((t) => t.locale === testimonial.sourceLocale);
  return {
    id: testimonial.id,
    authorName: testimonial.authorName,
    rating: testimonial.rating,
    quote: own?.quote ?? "",
    sourceLocale: testimonial.sourceLocale,
    isVerified: testimonial.orderId !== null,
    isFeatured: testimonial.isFeatured,
    sortOrder: testimonial.sortOrder,
    createdAt: testimonial.createdAt.toISOString(),
  };
}
