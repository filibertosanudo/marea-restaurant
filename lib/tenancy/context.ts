import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The business a database connection acts for, as Postgres row level
 * security sees it. Two sources, in this order:
 *
 *   1. `runInTenant`, for code that runs outside any request (the worker,
 *      scripts, an agent that authenticated by device token) and for tests.
 *   2. The request's own `x-marea-tenant` header, set by proxy.ts (see
 *      lib/tenancy/request-tenant.ts).
 *
 * Neither is trusted to widen access. Every query still filters by
 * businessId; this only decides what the policy lets through when that
 * filter is missing or wrong. No business at all means no rows.
 */
// Kept on globalThis, not in a module variable: Next bundles the server
// code once per layer (server components, SSR, route handlers), each with its
// own copy of this module, and a scope opened in one must be visible to the
// database pool created in another. Same reason lib/prisma.ts keeps its client there.
const globalForTenant = globalThis as unknown as { mareaTenantScope?: AsyncLocalStorage<string> };
const scope = (globalForTenant.mareaTenantScope ??= new AsyncLocalStorage<string>());

/** Header proxy.ts sets on every request; the same name is read back by request-tenant.ts. */
export const TENANT_HEADER = "x-marea-tenant";

/**
 * Runs `fn` acting for this business. Always async, and `fn`'s result is
 * awaited inside the scope on purpose: a Prisma query is lazy and only starts
 * when something awaits it, so `runInTenant(id, () => prisma.order.findMany())`
 * would otherwise return the unstarted query and run it outside the scope.
 */
export function runInTenant<T>(businessId: string, fn: () => T | PromiseLike<T>): Promise<T> {
  return scope.run(businessId, async () => await fn());
}

/**
 * Runs `fn` with no business on purpose, without looking at the request.
 * For reads that are public by design (the Business row) and, above all, for
 * code inside the data cache, where Next refuses to let anything read the
 * request's headers.
 */
export function runWithoutTenant<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  return scope.run("", async () => await fn());
}

/** The scope's business, "" for an explicit "none", undefined when there is no scope at all. */
export function explicitTenant(): string | undefined {
  return scope.getStore();
}
