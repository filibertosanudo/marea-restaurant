import { z } from "zod";

// The backup reads its own variables, by name, from the environment it is
// started with and nothing else: no .env, and no DATABASE_URL / DIRECT_URL. A
// script that infers where to connect from whatever a developer's shell holds
// is one stale variable away from dumping the wrong database at 4 a.m.
const schema = z.object({
  BACKUP_DATABASE_URL: z.string().url(),
  /** age public key: the server can encrypt, never decrypt. The private key lives outside it. */
  BACKUP_AGE_RECIPIENT: z.string().regex(/^age1[a-z0-9]{50,}$/, "an age public key (age1...)"),
  BACKUP_S3_ENDPOINT: z.string().url(),
  BACKUP_S3_BUCKET: z.string().min(1),
  BACKUP_S3_REGION: z.string().min(1).default("us-east-1"),
  BACKUP_S3_ACCESS_KEY_ID: z.string().min(1),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Only for temporary credentials (an STS session); a provider's static write-only key has none. */
  BACKUP_S3_SESSION_TOKEN: z.string().min(1).optional(),
  /** Set when the deployment stores photos on the local driver: the folder is archived with the database. */
  BACKUP_MEDIA_DIR: z.string().min(1).optional(),
  BACKUP_LOCK_MODE: z.enum(["COMPLIANCE", "GOVERNANCE"]).default("COMPLIANCE"),
  BACKUP_MONITOR_URL: z.string().url().optional(),
  /** Which code the dump goes with; the image build sets it. */
  BACKUP_APP_VERSION: z.string().min(1).default("unknown"),
});

export type BackupConfig = z.infer<typeof schema>;

export function readBackupConfig(env: Record<string, string | undefined>): BackupConfig {
  // An unset variable and an empty one are the same to a compose file's ${VAR:-}.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid backup configuration:\n${details}`);
  }
  return parsed.data;
}
