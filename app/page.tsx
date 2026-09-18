import { MareaLandingPage } from "@/components/marea-landing/MareaLandingPage";
import { getCurrentBusiness, getBusinessTranslations } from "@/lib/business";
import { getPublicMenuRaw } from "@/lib/menu/queries";
import { toPublicMenuByLang } from "@/lib/menu/public-menu";
import { listFeaturedPromotionsRaw } from "@/lib/promotions/queries";
import { listFeaturedTestimonialsRaw } from "@/lib/testimonials/queries";
import { getOpeningHours } from "@/lib/reservations/queries";
import { toLandingContentByLang } from "@/lib/dto/landing";

export default async function Home() {
  const business = await getCurrentBusiness();

  const [categories, promotions, testimonials, businessTranslations, openingHours] = await Promise.all([
    getPublicMenuRaw(business.id),
    listFeaturedPromotionsRaw(business.id),
    listFeaturedTestimonialsRaw(business.id),
    getBusinessTranslations(business.id),
    getOpeningHours(business.id),
  ]);

  const menuByLang = toPublicMenuByLang(categories);
  const landingByLang = toLandingContentByLang({
    promotions,
    testimonials,
    businessTranslations,
    openingHours,
    now: new Date(),
  });

  return (
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
  );
}
