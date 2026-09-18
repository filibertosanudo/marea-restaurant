import { z } from "zod";

/**
 * The public review form is deliberately two fields: a required star tap
 * and an optional comment. No name/email/phone — authorName is frozen from
 * the order server-side, never asked again.
 */
export const submitTestimonialSchema = z.object({
  rating: z.number().int().min(1).max(5),
  quote: z.string().trim().max(2000).optional(),
});
