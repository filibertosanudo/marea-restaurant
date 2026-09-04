// Stand-in for next/headers' cookies() in integration tests — real code
// (lib/cart/cookie.ts) reads the guest's cart/table cookie through this,
// and there's no live Next.js request to back it outside of one. Aliased
// in vitest.config.mts for the integration project only.
const store = new Map<string, string>();

export function cookies() {
  return {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
  };
}

export function setTestCookie(name: string, value: string): void {
  store.set(name, value);
}

export function clearTestCookies(): void {
  store.clear();
}
