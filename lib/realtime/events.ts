export type ChangeKind = "order" | "payment" | "cash";

/**
 * What a listener learns. Never order data: the receiver re-reads what
 * changed through the normal, authorised render. "reconcile" means "something
 * may have changed and I cannot say what": a recovery sweep that found too
 * much, or a switch between listening and polling.
 */
export type RealtimeEvent =
  | { kind: ChangeKind; businessId: string; orderId: string | null; status: string | null }
  | { kind: "reconcile"; businessId: string | null };

/** Same string in the trigger function (migration add_realtime_notify_triggers). */
export const CHANGE_CHANNEL = "marea_realtime";
/** The heartbeat's own channel; nothing but a listener's self-addressed pings travels here. */
export const PING_CHANNEL = "marea_realtime_ping";

const KINDS: readonly string[] = ["order", "payment", "cash"];

/** Parses the trigger's payload; anything that is not exactly its shape is dropped, not trusted. */
export function parseChange(payload: string | undefined): RealtimeEvent | null {
  if (!payload) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { b, o, k, s } = raw as Record<string, unknown>;
  if (typeof b !== "string" || typeof k !== "string" || !KINDS.includes(k)) return null;
  return {
    kind: k as ChangeKind,
    businessId: b,
    orderId: typeof o === "string" ? o : null,
    status: typeof s === "string" ? s : null,
  };
}
