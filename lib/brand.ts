/**
 * The letter in the round badge next to a name: the business's own on its
 * pages and printouts, the product's in the panel. One rule everywhere, so a
 * second restaurant never shows the first one's initial.
 */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}
