import Database from "better-sqlite3";
import { runMigrations } from "@/server/db/migrate";

/**
 * Create a fresh in-memory SQLite database with all migrations applied.
 * Sets globalThis._db so getDb() returns this instance for the duration
 * of the test. Call teardownTestDb() in afterEach to clean up.
 */
export function setupTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  // Migration 013 seeds workspace id=1. That is the workspace used by all tests.
  globalThis._db = db;
  return db;
}

export function teardownTestDb(db: Database.Database): void {
  db.close();
  globalThis._db = undefined;
}

/** Insert a minimal bank_credentials row and return its id. */
export function insertCredential(
  db: Database.Database,
  opts: { workspaceId?: number; provider?: string; label?: string } = {}
): number {
  const fake = Buffer.from("fake");
  const result = db
    .prepare(
      `INSERT INTO bank_credentials
         (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? 1,
      opts.provider ?? "isracard",
      opts.label ?? "Test Card",
      fake,
      fake,
      fake
    );
  return Number(result.lastInsertRowid);
}
