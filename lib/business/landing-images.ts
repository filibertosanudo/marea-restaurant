/**
 * The photographs behind the public landing's big blocks (hero, offers,
 * testimonials, reservation), per business.
 *
 * Every real client gets a website of its own on top of this system, so
 * these are the sample clients' photos, not a feature with a form in the
 * panel: they ship in `public/demo/` (Unsplash, free license, see
 * docs/demo-photos.md). A business with no entry here keeps the drawn
 * placeholders, exactly as before.
 */
export type LandingImages = {
  hero?: string;
  offers?: string;
  testimonials?: string;
  reservation?: string;
};

const BY_SLUG: Record<string, LandingImages> = {
  marea: {
    hero: "/demo/hero.jpg",
    offers: "/demo/ofertas.jpg",
    testimonials: "/demo/testimonios.jpg",
    reservation: "/demo/reservacion.jpg",
  },
};

export function landingImagesFor(slug: string): LandingImages {
  return BY_SLUG[slug] ?? {};
}

/**
 * Dish photos that ship with the repository live under /demo/ and are
 * stored on MenuItem.imageUrl as a same-origin path (prisma/seed.ts). They
 * are not uploads: the storage driver never wrote them and the media sweep
 * never deletes them. Only this exact shape is accepted, so a path cannot
 * be used to point an <img> anywhere else on the site.
 */
export function isBundledDemoImage(value: string): boolean {
  return /^\/demo\/[a-z0-9-]+\.jpg$/.test(value);
}
