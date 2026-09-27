/**
 * Splits a connection URL into the PG* variables libpq tools read, so a
 * password never appears on a command line (visible in `ps`) the way
 * `pg_dump --dbname=postgresql://user:pass@...` would put it.
 */
export function pgEnvFromUrl(url: string): Record<string, string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("connection string must start with postgresql://");
  }
  const env: Record<string, string> = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}
