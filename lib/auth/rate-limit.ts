/**
 * In-memory sliding-window limiter for login attempts, keyed by the
 * attempted email. Good enough for a single-instance deployment; if this
 * app ever runs multiple server instances, swap the Map for a shared store
 * (Postgres table or Redis) keyed the same way.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function isRateLimited(email: string): boolean {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordAttempt(email: string): void {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );
  recent.push(now);
  attempts.set(key, recent);
}

export function clearAttempts(email: string): void {
  attempts.delete(email.trim().toLowerCase());
}
