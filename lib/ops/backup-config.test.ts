import { describe, expect, it } from "vitest";
import { readBackupConfig } from "./backup-config";
import { majorOf } from "./backup";

const valid = {
  BACKUP_DATABASE_URL: "postgresql://marea:x@db:5432/marea",
  BACKUP_AGE_RECIPIENT: "age1" + "q".repeat(58),
  BACKUP_S3_ENDPOINT: "https://s3.example.com",
  BACKUP_S3_BUCKET: "backups",
  BACKUP_S3_ACCESS_KEY_ID: "id",
  BACKUP_S3_SECRET_ACCESS_KEY: "secret",
};

describe("readBackupConfig", () => {
  it("accepts a complete configuration and applies the defaults", () => {
    const config = readBackupConfig(valid);
    expect(config.BACKUP_LOCK_MODE).toBe("COMPLIANCE");
    expect(config.BACKUP_S3_REGION).toBe("us-east-1");
    expect(config.BACKUP_MEDIA_DIR).toBeUndefined();
  });

  it("treats an empty variable like a missing one", () => {
    expect(readBackupConfig({ ...valid, BACKUP_MEDIA_DIR: "", BACKUP_MONITOR_URL: "" }).BACKUP_MONITOR_URL).toBeUndefined();
  });

  it("names every missing variable", () => {
    expect(() => readBackupConfig({})).toThrow(/BACKUP_DATABASE_URL[\s\S]*BACKUP_AGE_RECIPIENT/);
  });

  it("does not fall back to the application's DATABASE_URL or DIRECT_URL", () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.BACKUP_DATABASE_URL;
    expect(() => readBackupConfig({ ...rest, DATABASE_URL: valid.BACKUP_DATABASE_URL, DIRECT_URL: valid.BACKUP_DATABASE_URL })).toThrow(
      /BACKUP_DATABASE_URL/
    );
  });

  it("refuses a value that is not an age public key, such as the private one", () => {
    expect(() => readBackupConfig({ ...valid, BACKUP_AGE_RECIPIENT: "AGE-SECRET-KEY-1ABC" })).toThrow(/age public key/);
  });
});

describe("majorOf", () => {
  it("reads the major version out of what pg_dump and the server print", () => {
    expect(majorOf("17.5")).toBe(17);
    expect(majorOf("pg_dump (PostgreSQL) 17.5")).toBe(17);
    expect(majorOf("16.9 (Debian 16.9-1.pgdg120+1)")).toBe(16);
  });

  it("refuses text with no version in it", () => {
    expect(() => majorOf("unknown")).toThrow();
  });
});
