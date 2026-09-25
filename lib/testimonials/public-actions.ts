"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPublicBusiness } from "@/lib/business";
import { getOrderForReviewByPublicToken } from "@/lib/orders/queries";
import { resolveOrderAuthorName } from "@/lib/orders/dto";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import { submitTestimonialSchema } from "@/lib/testimonials/schemas";

// A public, unauthenticated form that writes text later published on the
// site — the exact target a spammer looks for. Tighter than newsletter's
// ten-per-hour: nobody legitimately reviews more than a couple of orders in
// one sitting, and each order can only ever accept one review anyway.
const CREATE_SCOPE = "testimonial:create";
const CREATE_MAX_ATTEMPTS = 5;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

export type SubmitTestimonialResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "rate_limited" | "not_found" | "not_reviewable" | "already_reviewed" };

/**
 * `authorName` is read from the order and frozen onto the row here — never
 * re-derived later, never editable, matching every other "signed at the
 * time" field in this project. sourceLocale is resolved from the same
 * server-side cookie the rest of the guest order flow uses, not trusted
 * from client input, since it's provenance metadata about the submission,
 * not something the visitor is filling in.
 */
export async function submitTestimonialAction(
  publicToken: string,
  input: { rating: number; quote?: string }
): Promise<SubmitTestimonialResult> {
  const parsed = submitTestimonialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(CREATE_SCOPE, ip, CREATE_MAX_ATTEMPTS, CREATE_WINDOW_MS)) {
    return { ok: false, error: "rate_limited" };
  }

  const business = await getPublicBusiness();
  const order = await getOrderForReviewByPublicToken(business.id, publicToken);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "DELIVERED") return { ok: false, error: "not_reviewable" };
  if (order.testimonials.length > 0) return { ok: false, error: "already_reviewed" };

  await recordScopeAttempt(CREATE_SCOPE, ip);

  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const authorName = resolveOrderAuthorName(order);

  try {
    await prisma.testimonial.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        authorName,
        rating: parsed.data.rating,
        sourceLocale: lang,
        translations: parsed.data.quote
          ? { create: [{ locale: lang, quote: parsed.data.quote }] }
          : undefined,
      },
    });
  } catch (err) {
    // The unique index on orderId is the backstop for a race between two
    // near-simultaneous submits of the same link (see schema.prisma) — the
    // earlier findFirst check above is the normal-path guard, this catch is
    // what makes "one review per order" actually hold under concurrency.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "already_reviewed" };
    }
    throw err;
  }

  return { ok: true };
}
