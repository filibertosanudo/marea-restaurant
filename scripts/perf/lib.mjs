// Shared plumbing for the scripts in this folder: talks to a running server
// over plain HTTP, so what gets measured is the real request path (proxy,
// auth, server actions), and reads Postgres directly through `pg` for the
// numbers the server can't report about itself.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

export const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3100";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://marea:marea_perf@localhost:5440/marea";

export const ADMIN = { email: "admin@marea.test", password: "MareaAdmin123!" };

export function pool(max = 2) {
  return new pg.Pool({ connectionString: DATABASE_URL, max });
}

/** Server Action ids change per build; read them from the manifest of the build being measured. */
export function actionIds() {
  const manifest = JSON.parse(readFileSync(resolve(".next/server/server-reference-manifest.json"), "utf8"));
  const byName = {};
  for (const [id, entry] of Object.entries(manifest.node)) byName[entry.exportedName] = id;
  return byName;
}

/** Minimal cookie jar: name=value pairs from Set-Cookie, no expiry handling. */
export class Jar {
  #cookies = new Map();
  absorb(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      this.#cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() {
    return [...this.#cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export async function login({ email, password } = ADMIN) {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE_URL}/admin/pedidos` }),
  });
  jar.absorb(res);
  if (!jar.header().includes("session-token")) throw new Error(`login failed: HTTP ${res.status}`);
  return jar;
}

/**
 * Calls a Server Action the way the React client does: `Next-Action` header
 * plus a multipart body where part "0" is the JSON-encoded argument list and
 * a FormData argument is referenced as "$K1" with its fields prefixed "_1_".
 */
export async function callAction({ id, path, args, form = null, jar, ip }) {
  const body = new FormData();
  for (const [k, v] of form ?? []) body.append(`_1_${k}`, v);
  // Last, like the real client: the server decodes the stream in order and
  // the "$K1" reference is resolved from the fields that arrived before it.
  body.set("0", JSON.stringify(form ? [...args, "$K1"] : args));
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "next-action": id,
      accept: "text/x-component",
      cookie: jar.header(),
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body,
  });
  jar.absorb(res);
  return res;
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Fills a guest's cart over HTTP and returns the jar holding its cookie, ready for checkout. */
export async function prepareCart({ ids, itemIds, ip, index = 0 }) {
  const jar = new Jar();
  jar.absorb(await fetch(`${BASE_URL}/menu`, { headers: { "x-forwarded-for": ip } }));
  const lines = 1 + (index % 3);
  for (let i = 0; i < lines; i++) {
    const add = await callAction({
      id: ids.addToCartAction,
      path: "/menu",
      args: ["en", "$undefined"],
      form: [["menuItemId", itemIds[(index + i) % itemIds.length]], ["quantity", String(1 + (i % 2))]],
      jar,
      ip,
    });
    await add.arrayBuffer();
  }
  return jar;
}

/** Submits checkout for a prepared cart; resolves to the order's public token, or throws with the response. */
export async function submitCheckout({ ids, jar, ip, index = 0 }) {
  const res = await callAction({
    id: ids.createOrderAction,
    path: "/menu/checkout",
    args: ["en", "$undefined"],
    form: [["guestName", `Perf ${index}`], ["guestPhone", "+52 555 111 2222"], ["guestEmail", ""]],
    jar,
    ip,
  });
  const text = await res.text();
  const redirect = res.headers.get("x-action-redirect");
  if (!redirect) throw new Error(`checkout did not redirect: HTTP ${res.status} ${text.slice(0, 200)}`);
  return redirect.split(";")[0].replace("/o/", "");
}

/** Places one real guest order over HTTP (cart cookie, add-to-cart, checkout) and returns its public token. */
export async function placeOrder({ ids, itemIds, ip, index = 0 }) {
  const jar = await prepareCart({ ids, itemIds, ip, index });
  return submitCheckout({ ids, jar, ip, index });
}

/** Runs `task(i)` for i in [0, count) with at most `concurrency` in flight; resolves to per-task results in order. */
export async function runPool(count, concurrency, task) {
  const results = new Array(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (next < count) {
        const i = next++;
        results[i] = await task(i);
      }
    })
  );
  return results;
}

/** Deterministic fake client address, so the per-IP rate limit sees each virtual guest as a different person. */
export function fakeIp(n) {
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${(n & 255) || 1}`;
}
