// Stand-in for next/headers in integration tests — real code reads the
// guest's cart/table cookie through cookies() (lib/cart/cookie.ts) and the
// client IP through headers() (lib/reservations/actions.ts, via
// getClientIp), and there's no live Next.js request to back either outside
// one.
//
// cookies() is backed by AsyncLocalStorage, mirroring how Next.js itself
// isolates one request's cookies from another's: a plain shared object
// would work for a single concurrent identity, but several of this
// module's tests run two DIFFERENT carts' checkouts at the same time, and
// whichever call set its cookie last would leak into the other's
// still-pending read. headers() has no test depending on a specific value
// yet, so it stays a plain empty Headers — move it onto the same
// AsyncLocalStorage if that changes.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<Map<string, string>>();

function currentStore(): Map<string, string> {
  const store = als.getStore();
  if (!store) {
    throw new Error("cookies() called outside runWithCookies() — see test/stubs/next-headers.ts");
  }
  return store;
}

export function cookies() {
  return {
    get(name: string) {
      const value = currentStore().get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      currentStore().set(name, value);
    },
  };
}

/** Runs `fn` with its own isolated cookie jar, seeded with `cookies` — the test-side equivalent of one incoming request carrying these cookie headers. */
export function runWithCookies<T>(cookiesIn: Record<string, string>, fn: () => T): T {
  return als.run(new Map(Object.entries(cookiesIn)), fn);
}

// Every test starts on marea.localhost: nearly all of them build their one
// business with slug "marea" and expect the request to be about it, as the
// old fixed slug made it. A test with several businesses sets its own host.
const DEFAULT_TEST_HOST = "marea.localhost";
let testHost: string = DEFAULT_TEST_HOST;

/** Sets the Host every headers() call reports until clearTestHost(): the test-side equivalent of the request arriving on that subdomain. */
export function setTestHost(host: string): void {
  testHost = host;
}

export function clearTestHost(): void {
  testHost = DEFAULT_TEST_HOST;
}

export function headers(): Headers {
  return new Headers({ host: testHost });
}
