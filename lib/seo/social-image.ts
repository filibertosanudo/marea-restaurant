/**
 * Open Graph / Twitter Card share image. Business has no cover-photo field
 * of its own (no upload flow for one exists), so this reuses the first real,
 * admin-uploaded dish photo it finds — a link shared in WhatsApp with a
 * picture of the food is the point, and building a whole second image-upload
 * flow just for one og:image would be new infrastructure this phase doesn't
 * need.
 */
export function pickRepresentativeMenuImage(
  categories: { items: { imageUrl: string | null }[] }[]
): string | null {
  for (const category of categories) {
    for (const item of category.items) {
      if (item.imageUrl) return item.imageUrl;
    }
  }
  return null;
}
