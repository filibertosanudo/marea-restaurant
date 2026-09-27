// What a backup set is called and how long each copy lives. Shared by the
// uploader (object lock retention) and the bucket setup (lifecycle rules), so
// the two cannot drift: a lifecycle rule that expires earlier than the lock
// would be ignored by the store, one that expires later would keep data past
// what the privacy notice promises.

export const BACKUP_TIERS = ["sixhourly", "daily", "weekly", "monthly"] as const;
export type BackupTier = (typeof BACKUP_TIERS)[number];

/**
 * Days each tier is retained. The monthly tier is 90 days, not a year: a
 * backup keeps personal data as it was when taken, and docs/aviso-de-privacidad.md
 * promises copies are gone within 90 days.
 */
export const TIER_RETENTION_DAYS: Record<BackupTier, number> = {
  sixhourly: 2,
  daily: 7,
  weekly: 28,
  monthly: 90,
};

const SLOT_HOURS = 6;

/** The window a moment falls in, as "YYYY-MM-DDTHH" (UTC, hour rounded down to a multiple of 6). */
export function backupSlot(now: Date): string {
  const hour = Math.floor(now.getUTCHours() / SLOT_HOURS) * SLOT_HOURS;
  return `${now.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}`;
}

/**
 * Tiers a backup taken in `slot` belongs to. Every run is a six-hourly copy;
 * the first run of a UTC day is also the daily, the first of a Sunday also the
 * weekly, the first of a month also the monthly. One upload per tier, so
 * retention is decided by where an object lives and never by a script that deletes.
 */
export function tiersForSlot(slot: string): BackupTier[] {
  const day = new Date(`${slot.slice(0, 10)}T00:00:00Z`);
  const tiers: BackupTier[] = ["sixhourly"];
  if (!slot.endsWith("T00")) return tiers;
  tiers.push("daily");
  if (day.getUTCDay() === 0) tiers.push("weekly");
  if (day.getUTCDate() === 1) tiers.push("monthly");
  return tiers;
}
