// Next.js calls register() once, when the server process starts — not per
// request. Importing lib/env here turns a misconfigured deploy into a crash
// at boot instead of a 500 on the first real visitor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
