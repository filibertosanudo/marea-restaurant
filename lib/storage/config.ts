/**
 * Supabase Storage isn't configured in this environment (dev runs against a
 * local Postgres, not a real Supabase project) — see docs/prompts. The image
 * dropzone degrades to a plain URL field until these are set.
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
