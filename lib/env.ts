import "server-only";
import { z } from "zod";
import { safeHostname } from "@/lib/url";

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "postgresql://user:pass@host:5432/db"),
    // Outside serverless, the app is a long-lived process with its own
    // pool: (Postgres max_connections - reserved) / (replicas + workers).
    // Postgres defaults to max_connections=100; with a couple of replicas
    // and headroom for a future worker, 25 per process is comfortable.
    // Whoever needs to raise it should know what it's measured against.
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(25),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.string().url().optional(),
    APP_ORIGIN: z.string().url().optional(),
    // Proxies between the client and this app that rewrite (not just append
    // to) x-forwarded-for: Vercel or a properly configured nginx both count
    // as 1. See docs/DEPLOY.md for the nginx directives that make this true.
    TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(1),
    SSE_MAX_LIFETIME_MS: z.coerce.number().int().min(0).default(75_000),
    MEDIA_HOSTNAME: z.string().min(1).optional(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().min(1).default("./data/media"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    // APP_ORIGIN (or its AUTH_URL fallback) only matters once a URL gets
    // printed and handed to a stranger — a printed table QR chief among
    // them. In development it's fine to fall back to localhost; in
    // production there's no safe fallback, so this is the one field that's
    // conditionally required instead of just optional.
    if (process.env.NODE_ENV === "production" && !value.APP_ORIGIN && !value.AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "required in production (AUTH_URL also accepted as a fallback)",
      });
    }

    // Same shape of conditional requirement as APP_ORIGIN above, but keyed
    // off a driver choice instead of NODE_ENV: fail at boot, not mid-upload.
    if (value.STORAGE_DRIVER === "s3") {
      const required = [
        "S3_ENDPOINT",
        "S3_BUCKET",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const;
      for (const key of required) {
        if (!value[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: "required when STORAGE_DRIVER=s3" });
        }
      }
    }
  });

type Env = z.infer<typeof schema>;

// Validated lazily, on first real access — not at import. lib/env is
// reachable from route modules that Next's build (not just `next start`)
// loads to collect page metadata, and in the Docker build this module
// targets, that build stage runs before runtime secrets like DATABASE_URL
// exist. instrumentation.ts forces the first access at server boot, once
// real values are in place, so a misconfigured deploy still fails at boot
// and not on the first real request.
let cached: Env | undefined;

function loadEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
});

function resolvedOrigin(): string | undefined {
  return env.APP_ORIGIN ?? env.AUTH_URL;
}

/** This deployment's canonical origin — never localhost once NODE_ENV is production, enforced above. */
export function appOrigin(): string {
  const origin = resolvedOrigin() ?? "http://localhost:3000";
  return origin.replace(/\/$/, "");
}

let cachedImageHosts: Set<string> | undefined;

/** Hosts a stored image URL is allowed to point at: this deployment's own origin, the storage host once one is configured, and — for the s3 driver with no custom MEDIA_HOSTNAME — the S3 endpoint's own host, since that's what publicUrl() falls back to. */
export function allowedImageHosts(): Set<string> {
  if (!cachedImageHosts) {
    const hosts = new Set<string>();
    const origin = resolvedOrigin();
    const originHostname = origin ? safeHostname(origin) : null;
    if (originHostname) hosts.add(originHostname);
    if (env.MEDIA_HOSTNAME) hosts.add(env.MEDIA_HOSTNAME);
    if (env.STORAGE_DRIVER === "s3" && env.S3_ENDPOINT) {
      const s3Hostname = safeHostname(env.S3_ENDPOINT);
      if (s3Hostname) hosts.add(s3Hostname);
    }
    cachedImageHosts = hosts;
  }
  return cachedImageHosts;
}

/**
 * `z.string().url()` alone lets `javascript:` and plain `http:` through —
 * inert inside an `<img src>`, but it allows mixed content and lets a
 * third-party host track whoever opens the admin panel. Restricted to
 * https and to this deployment's own known hosts — with one carve-out:
 * plain http on localhost/127.0.0.1 outside production, since that's this
 * app's own local-driver URL in every local dev environment, and a
 * loopback address carries none of the mixed-content/tracking risk this
 * check exists for.
 */
export function isAllowedImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const isSecure = url.protocol === "https:";
  const isLocalHttp =
    url.protocol === "http:" &&
    process.env.NODE_ENV !== "production" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return (isSecure || isLocalHttp) && allowedImageHosts().has(url.hostname);
}
