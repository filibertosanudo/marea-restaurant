// "server-only" throws unconditionally under plain Node module resolution
// (its package.json only no-ops it under the "react-server" export
// condition, which Vite/Vitest don't set) — aliased to this empty stub in
// vitest.config.mts so unit tests can import server-only modules at all.
export {};
