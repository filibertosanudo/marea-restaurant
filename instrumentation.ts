// Next.js calls register() once, when the server process starts — not per
// request and not during `next build`. lib/env validates lazily on first
// property access (see its own comment), so touching one here is what
// turns a misconfigured deploy into a crash at boot instead of a 500 on
// the first real visitor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    void env.DATABASE_URL;

    // Row level security only binds a role that does not own the tables (see
    // lib/db/role-check.ts). A definite answer of "this one does" stops a
    // production boot; not being able to ask (database still coming up) does not.
    if (env.DATABASE_ROLE_CHECK !== "off") {
      const { prisma } = await import("@/lib/prisma");
      const { findRoleProblem } = await import("@/lib/db/role-check");
      const problem = await findRoleProblem(prisma).catch((err: unknown) => {
        console.warn("Could not verify the database role at boot:", err instanceof Error ? err.message : err);
        return null;
      });
      if (problem) {
        const message = `Row level security is not in effect: the application ${problem}. Use the marea_app role (docs/DEPLOY.md).`;
        if (env.DATABASE_ROLE_CHECK === "enforce" && process.env.NODE_ENV === "production") {
          throw new Error(message);
        }
        console.warn(message);
      }
    }
  }
}
