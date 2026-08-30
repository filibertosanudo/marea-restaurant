import { MareaLandingPage } from "@/components/marea-landing/MareaLandingPage";
import { getCurrentBusiness } from "@/lib/business";
import { getPublicMenuRaw } from "@/lib/menu/queries";
import { toPublicMenuByLang } from "@/lib/menu/public-menu";

export default async function Home() {
  const business = await getCurrentBusiness();
  const categories = await getPublicMenuRaw(business.id);
  const menuByLang = toPublicMenuByLang(categories);

  return <MareaLandingPage menuByLang={menuByLang} maxPartySize={business.maxPartySize} />;
}
