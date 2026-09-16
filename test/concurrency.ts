// Runs several async actions "at the same time" for race-condition tests
// (two checkouts on the same cart, two bookings on the same slot, ...).
// No setTimeout anywhere here on purpose: a test that needs a timer to
// line up two calls is timing-dependent and will flake in CI on a slow
// day. Starting every thunk before awaiting any of them is enough to put
// them all in flight concurrently at the point that actually matters —
// the database — since JS never interleaves synchronous work between
// two of them once each has started.

/** Starts every thunk without waiting between them, then resolves once all have settled. */
export function runConcurrently<T>(thunks: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  const promises = thunks.map((thunk) => thunk());
  return Promise.allSettled(promises);
}

/** Splits settled results into their fulfilled values and rejection reasons, in the order they were given. */
export function partitionSettled<T>(results: PromiseSettledResult<T>[]): { fulfilled: T[]; rejected: unknown[] } {
  const fulfilled: T[] = [];
  const rejected: unknown[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      fulfilled.push(result.value);
    } else {
      rejected.push(result.reason);
    }
  }
  return { fulfilled, rejected };
}

/**
 * Polls real Postgres lock-wait state until some other backend is genuinely
 * blocked trying to lock `"schema"."tableName"` — for making a
 * two-transaction race deterministic instead of guessing how long the
 * racing transaction needs to reach its own guarded write. A sleep-based
 * guess is either too short (the race never actually happens) or flaky
 * under CI load; this instead waits for the exact condition the test needs
 * before releasing the lock holder. Matched on the schema-qualified table
 * name, not just the table name alone — integration tests run several
 * files in parallel, each in its own schema, and `pg_stat_activity` is
 * server-wide, so an unqualified match could pick up an unrelated worker's
 * query touching a same-named table in a different schema.
 */
export async function waitForLockWaitOn(
  prisma: { $queryRawUnsafe: <T>(query: string) => Promise<T> },
  schema: string,
  tableName: string,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const needle = `"${schema}"."${tableName}"`;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%${needle}%'`
    );
    if ((rows[0]?.count ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for a lock wait on ${needle}`);
}
