import pg from "pg";

/** The Postgres setting every row level security policy compares "businessId" against. */
export const TENANT_SETTING = "app.business_id";

type ResolveTenant = () => string | null | undefined | Promise<string | null | undefined>;

// What each pooled connection was last told, so a connection that keeps
// serving the same business (the normal case: one business, or a tenant's
// requests landing on the same socket) costs no extra round trip.
const applied = new WeakMap<pg.PoolClient, string>();

async function applyTenant(client: pg.PoolClient, tenant: string | null | undefined): Promise<void> {
  const wanted = tenant ?? "";
  if (applied.get(client) === wanted) return;
  await client.query("SELECT set_config($1, $2, false)", [TENANT_SETTING, wanted]);
  applied.set(client, wanted);
}

/**
 * An idle connection must carry no business. The business is set when a
 * connection is handed out; this clears it when the connection comes back, so
 * that a path that never sets one (another client, a raw connection, a bug)
 * finds "nothing" and never finds the last caller's business.
 *
 * pg-pool gives every checkout a fresh `release`, so this wraps it each time.
 * The clearing statement is queued on the connection ahead of whatever the
 * next holder sends, and the connection only goes back to the pool once it has
 * run, so nobody can be handed it half-cleared. The caller is not kept waiting:
 * pg-pool answers the query before it releases.
 */
function clearOnRelease(client: pg.PoolClient): void {
  const release = client.release.bind(client);
  client.release = (error?: Error | boolean) => {
    if (error) {
      applied.delete(client);
      return release(error);
    }
    client.query("SELECT set_config($1, '', false)", [TENANT_SETTING]).then(
      () => {
        applied.set(client, "");
        release();
      },
      (err: Error) => {
        applied.delete(client);
        release(err);
      }
    );
  };
}

/**
 * A pool that stamps the business onto each connection as it is handed out.
 *
 * Row level security reads a Postgres setting, and with a pool the setting
 * lives on a connection that later serves somebody else. Two traps, and
 * both are closed here rather than left to every call site:
 *
 *   - A stale value from the previous tenant. Every acquisition compares
 *     what the connection was last told against what this caller needs and
 *     overwrites it when they differ, before any query runs. A caller with
 *     no business gets the empty string, which matches no row.
 *   - A value left behind on an idle connection: cleared on release, see
 *     clearOnRelease(), so forgetting to set one fails closed.
 *   - A value that only lives inside a transaction (`set_config(..., true)`).
 *     A single Prisma query is its own implicit transaction and an
 *     interactive `$transaction` opens one, so a transaction-local value
 *     would have to be re-issued inside every one of them. The setting is
 *     session-level instead, applied on acquisition, which covers both.
 *
 * `pool.query()` goes through `connect()` internally, so overriding
 * `connect` alone covers every path Prisma's pg adapter takes.
 */
export class TenantPool extends pg.Pool {
  constructor(
    config: pg.PoolConfig,
    private readonly resolveTenant: ResolveTenant
  ) {
    super(config);
  }

  // The tenant is resolved at the moment of the call, synchronously in the
  // caller's async context (that is where the request's headers and any
  // runInTenant scope live), not later when the pool gets around to it.
  connect(): Promise<pg.PoolClient>;
  connect(callback: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  connect(callback?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void) {
    const tenant = Promise.resolve(this.resolveTenant()).catch(() => null);
    const acquire = super.connect() as Promise<pg.PoolClient>;

    const ready = Promise.all([acquire, tenant]).then(async ([client, resolved]) => {
      clearOnRelease(client);
      try {
        await applyTenant(client, resolved);
      } catch (err) {
        client.release(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
      return client;
    });

    if (!callback) return ready;
    ready.then(
      (client) => callback(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (err) => callback(err instanceof Error ? err : new Error(String(err)), undefined, () => {})
    );
    return undefined;
  }
}
