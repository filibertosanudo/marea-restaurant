import "server-only";
import { z } from "zod";

// Validated once, at import — not the first time some unrelated code path
// happens to touch process.env. A misconfigured deploy should fail here,
// at boot, with a message that says exactly what's missing, instead of
// surfacing as a 500 to the first real visitor.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "postgresql://user:pass@host:5432/db"),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  APP_ORIGIN: z.string().url().optional(),
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(1),
  SSE_MAX_LIFETIME_MS: z.coerce.number().int().min(0).default(75_000),
  MEDIA_HOSTNAME: z.string().min(1).optional(),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  // APP_ORIGIN (or its AUTH_URL fallback) only matters once URLs get printed
  // and handed to a stranger — a printed table QR chief among them. In
  // development it's fine to fall back to localhost; in production there is
  // no safe fallback, so this is checked separately from the schema above
  // instead of just being marked required, which would also break `next dev`.
  if (process.env.NODE_ENV === "production" && !value.APP_ORIGIN && !value.AUTH_URL) {
    throw new Error(
      "Invalid environment configuration:\n  APP_ORIGIN: required in production (AUTH_URL also accepted as a fallback)"
    );
  }

  return value;
}

export const env = loadEnv();

/** This deployment's canonical origin — never localhost once NODE_ENV is production, enforced above. */
export function appOrigin(): string {
  const origin = env.APP_ORIGIN ?? env.AUTH_URL ?? "http://localhost:3000";
  return origin.replace(/\/$/, "");
}

/** Hosts a stored image URL is allowed to point at: this deployment's own origin, plus the storage host once one is configured. */
export function allowedImageHosts(): string[] {
  const hosts = new Set<string>();
  const origin = env.APP_ORIGIN ?? env.AUTH_URL;
  if (origin) hosts.add(new URL(origin).hostname);
  if (env.MEDIA_HOSTNAME) hosts.add(env.MEDIA_HOSTNAME);
  return [...hosts];
}
