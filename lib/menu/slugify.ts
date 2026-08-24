// Strips Unicode combining diacritical marks (U+0300-U+036F) left behind by
// NFD normalization, so "Café" -> "cafe" instead of "café".
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
