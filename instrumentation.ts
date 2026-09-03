// Next.js calls register() once, when the server process starts — not per
// request and not during `next build`. lib/env validates lazily on first
// property access (see its own comment), so touching one here is what
// turns a misconfigured deploy into a crash at boot instead of a 500 on
// the first real visitor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    void env.DATABASE_URL;
  }
}
