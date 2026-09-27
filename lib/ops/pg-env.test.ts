import { describe, expect, it } from "vitest";
import { pgEnvFromUrl } from "./pg-env";

describe("pgEnvFromUrl", () => {
  it("splits a connection string into the variables libpq reads", () => {
    expect(pgEnvFromUrl("postgresql://marea:s3cret@db.internal:5433/marea?sslmode=require")).toEqual({
      PGHOST: "db.internal",
      PGPORT: "5433",
      PGUSER: "marea",
      PGPASSWORD: "s3cret",
      PGDATABASE: "marea",
      PGSSLMODE: "require",
    });
  });

  it("decodes a password with reserved characters and defaults the port", () => {
    const env = pgEnvFromUrl("postgres://owner:p%40ss%2Fword@localhost/marea");
    expect(env.PGPASSWORD).toBe("p@ss/word");
    expect(env.PGPORT).toBe("5432");
    expect(env.PGSSLMODE).toBeUndefined();
  });

  it("refuses anything that is not a Postgres URL", () => {
    expect(() => pgEnvFromUrl("mysql://a:b@c/d")).toThrow(/postgresql/);
  });
});
