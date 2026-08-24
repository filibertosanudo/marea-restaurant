import "server-only";
import type { PublicModifierGroup } from "@/lib/menu/public-menu";

export type ModifierValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side enforcement of each group's selectionType/minSelections/
 * maxSelections/isRequired against a dish's actual modifier groups — the
 * client sends option ids, nothing else is trusted. Shared by the add-to-cart
 * action (this phase) and order creation (module 2 phase 3), so the rule
 * lives in exactly one place.
 */
export function validateModifierSelection(
  groups: PublicModifierGroup[],
  selectedOptionIds: string[]
): ModifierValidationResult {
  const selected = new Set(selectedOptionIds);
  const knownOptionIds = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));

  for (const id of selected) {
    if (!knownOptionIds.has(id)) {
      return { ok: false, error: "unknown_modifier_option" };
    }
  }

  for (const group of groups) {
    const chosenInGroup = group.options.filter((o) => selected.has(o.id));

    const unavailableChosen = chosenInGroup.find((o) => !o.isAvailable);
    if (unavailableChosen) {
      return { ok: false, error: "modifier_option_unavailable" };
    }

    const count = chosenInGroup.length;
    const min = group.isRequired ? Math.max(group.minSelections, 1) : group.minSelections;
    const max =
      group.selectionType === "SINGLE" ? 1 : group.maxSelections ?? Number.POSITIVE_INFINITY;

    if (count < min || count > max) {
      return { ok: false, error: "modifier_group_selection_out_of_range" };
    }
  }

  return { ok: true };
}

/** The full option rows (name, priceDelta) for a set of chosen ids — used to compute unitPrice / snapshot names. */
export function pickSelectedOptions(groups: PublicModifierGroup[], selectedOptionIds: string[]) {
  const selected = new Set(selectedOptionIds);
  return groups.flatMap((g) => g.options.filter((o) => selected.has(o.id)));
}
