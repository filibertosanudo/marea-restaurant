// Integration tests run against a real Postgres instance — unlike the unit
// project's setup.ts, there is no placeholder fallback here. A missing
// DATABASE_URL must fail loudly as a misconfigured test run, not silently
// resolve against a database that doesn't exist and read as a connection
// error instead of what it actually is.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required to run integration tests — point it at a real Postgres instance."
  );
}
