import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/server/db/migrate";

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface CategoryRow {
  name: string;
  sharing_type: string;
}

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("migration 022: categories table columns", () => {
  it("adds sharing_type column with NOT NULL DEFAULT individual", () => {
    const db = freshDb();
    const columns = db.pragma("table_info(categories)") as TableInfoRow[];
    const col = columns.find((c) => c.name === "sharing_type");
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe("'individual'");
    db.close();
  });

  it("adds fixed_ratio column with NOT NULL DEFAULT 0.5", () => {
    const db = freshDb();
    const columns = db.pragma("table_info(categories)") as TableInfoRow[];
    const col = columns.find((c) => c.name === "fixed_ratio");
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe("0.5");
    db.close();
  });

  it("adds sharing_override column on transactions, nullable", () => {
    const db = freshDb();
    const columns = db.pragma("table_info(transactions)") as TableInfoRow[];
    const col = columns.find((c) => c.name === "sharing_override");
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(0);
    db.close();
  });
});

describe("migration 022: CHECK constraints", () => {
  it("rejects inserting a category with an invalid sharing_type", () => {
    const db = freshDb();
    expect(() => {
      db.prepare(
        `INSERT INTO categories (workspace_id, name, color, icon, kind, sharing_type)
         VALUES (1, 'TestBogus', '#aaaaaa', 'circle', 'expense', 'bogus')`
      ).run();
    }).toThrow();
    db.close();
  });

  it("accepts valid sharing_type values", () => {
    const db = freshDb();
    for (const sharingType of ["individual", "fixed", "ratioed"]) {
      expect(() => {
        db.prepare(
          `INSERT INTO categories (workspace_id, name, color, icon, kind, sharing_type)
           VALUES (1, ?, '#aaaaaa', 'circle', 'expense', ?)`
        ).run(`TestValid_${sharingType}`, sharingType);
      }).not.toThrow();
    }
    db.close();
  });

  it("rejects inserting a transaction with an invalid sharing_override", () => {
    const db = freshDb();
    // First insert a minimal sync_run and credential so FK is satisfied
    db.prepare(
      `INSERT INTO sync_runs
         (provider, started_at, status, scrape_from_date, transactions_added, transactions_updated)
       VALUES ('test', datetime('now'), 'completed', '2024-01-01', 0, 0)`
    ).run();
    const syncRunId = (db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
    expect(() => {
      db.prepare(
        `INSERT INTO transactions
           (workspace_id, account_number, date, processed_date, original_amount,
            original_currency, charged_amount, description, type, status,
            provider, sync_run_id, dedup_hash, dedup_sequence, kind, sharing_override)
         VALUES (1, 'ACC1', '2024-01-01', '2024-01-01', 100, 'ILS', -100,
                 'Test', 'normal', 'completed', 'test', ?, 'hash1', 0, 'expense', 'invalid')`
      ).run(syncRunId);
    }).toThrow();
    db.close();
  });
});

describe("migration 022: seeded sharing_type defaults", () => {
  it("sets sharing_type = fixed for Groceries", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Groceries' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("fixed");
    db.close();
  });

  it("sets sharing_type = fixed for Restaurants", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Restaurants' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("fixed");
    db.close();
  });

  it("sets sharing_type = fixed for Bills & Utilities", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Bills & Utilities' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("fixed");
    db.close();
  });

  it("sets sharing_type = fixed for Subscriptions", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Subscriptions' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("fixed");
    db.close();
  });

  it("sets sharing_type = fixed for Home", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Home' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("fixed");
    db.close();
  });

  it("leaves Shopping as sharing_type = individual (non-seeded)", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Shopping' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("individual");
    db.close();
  });

  it("leaves Insurance as sharing_type = individual (non-seeded)", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Insurance' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("individual");
    db.close();
  });

  it("leaves Education as sharing_type = individual (non-seeded)", () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name, sharing_type FROM categories WHERE name = 'Education' COLLATE NOCASE")
      .get() as CategoryRow | undefined;
    expect(row?.sharing_type).toBe("individual");
    db.close();
  });

  it("all categories without an explicit seed have sharing_type = individual", () => {
    const db = freshDb();
    const seeded = ["Groceries", "Restaurants", "Bills & Utilities", "Subscriptions", "Home"];
    const placeholders = seeded.map(() => "?").join(",");
    const others = db
      .prepare(
        `SELECT name, sharing_type FROM categories
         WHERE name NOT IN (${placeholders}) COLLATE NOCASE`
      )
      .all(...seeded) as CategoryRow[];
    for (const row of others) {
      expect(row.sharing_type).toBe("individual");
    }
    db.close();
  });
});
