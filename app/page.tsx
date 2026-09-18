import type { Metadata } from "next";
import { MareaLandingPage } from "@/components/marea-landing/MareaLandingPage";
import { getCurrentBusiness, getBusinessTranslations } from "@/lib/business";
import { getPublicMenuRaw, getRepresentativeMenuImageUrl } from "@/lib/menu/queries";
import { toPublicMenuByLang } from "@/lib/menu/public-menu";
import { listFeaturedPromotionsRaw } from "@/lib/promotions/queries";
import { listFeaturedTestimonialsRaw } from "@/lib/testimonials/queries";
import { getOpeningHours } from "@/lib/reservations/queries";
import { toLandingContentByLang } from "@/lib/dto/landing";
import { resolveSiteMetadataText } from "@/lib/seo/site-metadata";
import { buildRestaurantJsonLd } from "@/lib/seo/restaurant-jsonld";
import { appOrigin } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const business = await getCurrentBusiness();
  const [{ title, description }, image] = await Promise.all([
    resolveSiteMetadataText(),
    getRepresentativeMenuImageUrl(business.id),
  ]);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: appOrigin(),
      siteName: business.name,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function Home() {
  const business = await getCurrentBusiness();

  const [categories, promotions, testimonials, businessTranslations, openingHours, image, { description }] =
    await Promise.all([
      getPublicMenuRaw(business.id),
      listFeaturedPromotionsRaw(business.id),
      listFeaturedTestimonialsRaw(business.id),
      getBusinessTranslations(business.id),
      getOpeningHours(business.id),
      getRepresentativeMenuImageUrl(business.id),
      resolveSiteMetadataText(),
    ]);

  const menuByLang = toPublicMenuByLang(categories);
  const landingByLang = toLandingContentByLang({
    promotions,
    testimonials,
    businessTranslations,
    openingHours,
    now: new Date(),
  });

  const jsonLd = buildRestaurantJsonLd({
    name: business.name,
    description,
    url: appOrigin(),
    image,
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2,
    city: business.city,
    country: business.country,
    phone: business.phone,
    email: business.email,
    openingHours,
    menuUrl: `${appOrigin()}/menu`,
  });

  return (
    <>
      <script
        type="application/ld+json"
        // Escaping "<" keeps an admin-entered business name/description
        // containing "</script>" from breaking out of this tag — the
        // content is admin-authored, not anonymous input, but still real
        // text, not a static literal.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <MareaLandingPage
        menuByLang={menuByLang}
        landingByLang={landingByLang}
        business={{
          addressLine1: business.addressLine1,
          addressLine2: business.addressLine2,
          city: business.city,
          phone: business.phone,
          email: business.email,
        }}
        maxPartySize={business.maxPartySize}
      />
    </>
  );
}
