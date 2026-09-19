// Every time constant of the realtime layer, named separately on purpose:
// several of them happen to be the same number today and mean different
// things, and merging two that only look alike is how a recovery window ends
// up tuned by a heartbeat setting.

/**
 * Prisma's interactive-transaction timeout when none is passed, and nothing in
 * this app passes one (a test scans for it: timing.test.ts). So no transaction
 * this app opens stays open longer than this.
 */
export const PRISMA_TRANSACTION_TIMEOUT_MS = 5_000;

/** Slack between the clock that stamps a row (the app's, through Prisma) and the clock the listener reads. */
export const CLOCK_SKEW_ALLOWANCE_MS = 5_000;

/**
 * How far back a recovery sweep re-reads from the last moment the channel was
 * known healthy. A row is stamped when its statement runs and becomes visible
 * at commit, at most one transaction timeout later, so an event can commit
 * after a newer one was already seen and still carry an older timestamp (the
 * cursor-by-timestamp trap; recovery.integration.test.ts reproduces it). The
 * window has to cover that gap: twice the timeout as margin, plus the skew.
 */
export const RECOVERY_WINDOW_MS = 2 * PRISMA_TRANSACTION_TIMEOUT_MS + CLOCK_SKEW_ALLOWANCE_MS;

/** How often the listener proves its own channel still delivers (a self-addressed NOTIFY). */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** How long an echo may take before the channel is declared dead. */
export const HEARTBEAT_TIMEOUT_MS = 5_000;

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/** Polling cadence while LISTEN is unavailable: slower than the old 2 s, and one loop for every connected screen. */
export const POLL_FALLBACK_INTERVAL_MS = 10_000;

/** Unhealthy for this long before falling back to polling, so a normal connect does not start a poller. */
export const POLL_FALLBACK_DELAY_MS = 3_000;

/** A sweep that finds more changes than this is reported as one "reconcile" instead of a delta per order. */
export const SWEEP_EVENT_LIMIT = 200;

/** Events landing within this window are sent to a screen as one update: one order fires a few triggers. */
export const SSE_COALESCE_MS = 150;

/** How long the last screen may leave before the LISTEN connection is closed. */
export const HUB_IDLE_GRACE_MS = 30_000;
