import { formatOpeningHoursSchemaOrg } from "@/lib/business/opening-hours-format";
import type { OpeningHourWindow } from "@/lib/reservations/availability";

export type RestaurantJsonLdInput = {
  name: string;
  description: string | null;
  url: string;
  image: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  openingHours: OpeningHourWindow[];
  menuUrl: string;
};

/**
 * schema.org Restaurant structured data for Google's rich results and the
 * knowledge-panel side card. Deliberately carries no `aggregateRating` or
 * `review` — Google's own guidance is explicit that "if the entity that's
 * being reviewed controls the reviews about itself, their pages ... are
 * ineligible for star review" rich results, and Restaurant is a
 * LocalBusiness subtype. Testimonials here are moderated by the business
 * they're about, so this is the correct output, not a missing feature — see
 * the module 15 design decision on ratings.
 *
 * priceRange and servesCuisine are valid optional schema.org properties this
 * function would happily include, but Business has no columns for either
 * today — omitted rather than filled with an invented placeholder, since a
 * fabricated "$$" or cuisine label would be exactly the kind of made-up
 * business data this module exists to remove, not add.
 */
/** JSON-LD readers (unlike a browser resolving an <img src>) generally don't resolve a relative URL against the page it came from — schema.org's own examples are always absolute. `imageUrl` columns in this app can hold either, depending on the storage driver, so this makes the guarantee explicit here instead of trusting every caller to have already done it. */
function toAbsoluteUrl(url: string, origin: string): string {
  return url.startsWith("/") ? `${origin}${url}` : url;
}

export function buildRestaurantJsonLd(input: RestaurantJsonLdInput) {
  const streetAddress = [input.addressLine1, input.addressLine2].filter(Boolean).join(", ");
  const address =
    streetAddress || input.city
      ? {
          "@type": "PostalAddress",
          ...(streetAddress ? { streetAddress } : {}),
          ...(input.city ? { addressLocality: input.city } : {}),
          ...(input.country ? { addressCountry: input.country } : {}),
        }
      : undefined;

  const openingHours = formatOpeningHoursSchemaOrg(input.openingHours);

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: input.name,
    url: input.url,
    hasMenu: input.menuUrl,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: toAbsoluteUrl(input.image, input.url) } : {}),
    ...(address ? { address } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(openingHours.length > 0 ? { openingHours } : {}),
  };
}
