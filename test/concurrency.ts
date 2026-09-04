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
