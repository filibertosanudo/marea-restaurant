import type { BoardColumnStatus } from "@/lib/orders/state-machine";

/** The board's own view filters, as they sit in the page's query string. */
export type BoardApiFilters = { type?: string | null; table?: string | null };

function withFilters(params: URLSearchParams, filters: BoardApiFilters) {
  if (filters.type) params.set("type", filters.type);
  if (filters.table) params.set("table", filters.table);
  return params;
}

/** The cards for a few orders a live event named. */
export function boardCardsUrl(ids: string[], filters: BoardApiFilters): string {
  return `/api/orders/board?${withFilters(new URLSearchParams({ ids: ids.join(",") }), filters)}`;
}

/** A column's first page, or the page after `after` (see board-cursor.ts). */
export function boardPageUrl(status: BoardColumnStatus, after: string | null, filters: BoardApiFilters): string {
  const params = new URLSearchParams({ status });
  if (after) params.set("after", after);
  return `/api/orders/board?${withFilters(params, filters)}`;
}
