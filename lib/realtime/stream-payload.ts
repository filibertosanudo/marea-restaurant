// Pure, no "use client": the stream hook, its connection manager and the
// tests all share these.

export type StreamStatus = "connecting" | "open" | "offline";

/**
 * What an `update` event says, for a staff screen: which orders changed
 * (and how), or that it cannot say and the screen should re-read everything.
 * A guest tracking an order gets neither, and always re-reads its own page.
 */
export type StreamPayload = {
  reconcile?: boolean;
  changes?: { kind: "order" | "payment" | "cash"; orderId: string | null; status: string | null }[];
};

/** The event body as sent, or null when there is nothing usable in it. Never trusted beyond its shape. */
export function parseStreamPayload(data: unknown): StreamPayload | null {
  if (typeof data !== "string") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { reconcile, changes } = raw as Record<string, unknown>;
  if (reconcile === true) return { reconcile: true };
  if (!Array.isArray(changes)) return null;
  const parsed: NonNullable<StreamPayload["changes"]> = [];
  for (const change of changes) {
    if (typeof change !== "object" || change === null) return null;
    const { kind, orderId, status } = change as Record<string, unknown>;
    if (kind !== "order" && kind !== "payment" && kind !== "cash") return null;
    parsed.push({
      kind,
      orderId: typeof orderId === "string" ? orderId : null,
      status: typeof status === "string" ? status : null,
    });
  }
  return { changes: parsed };
}
