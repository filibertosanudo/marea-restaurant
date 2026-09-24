// Pure, no server-only import: the board's client code builds cursors from the
// cards it already holds, and the server parses them back.

/**
 * Where the next page of a board column starts: the last card of the current
 * page, by the column's own order (oldest first, id as the tie-break). The
 * placedAt string is the same ISO text the card DTO carries, so the client
 * never formats a date.
 */
export type BoardCursor = { placedAt: string; id: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeBoardCursor(cursor: BoardCursor): string {
  return `${cursor.placedAt}|${cursor.id}`;
}

/** Anything that is not exactly what encodeBoardCursor produces is null: a malformed cursor is a bad request, never a guess. */
export function decodeBoardCursor(raw: string | null | undefined): BoardCursor | null {
  if (!raw) return null;
  const [placedAt, id, ...rest] = raw.split("|");
  if (rest.length > 0 || !placedAt || !id || !ID_PATTERN.test(id)) return null;
  const parsed = new Date(placedAt);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== placedAt) return null;
  return { placedAt, id };
}
