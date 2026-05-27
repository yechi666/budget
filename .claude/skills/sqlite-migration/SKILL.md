---
name: sqlite-migration
description: Adds or modifies SQLite migrations in the Spent codebase (better-sqlite3, sequential SQL files in src/server/db/migrations/). Knows the table-recreate pattern for NOT NULL FK additions, COLLATE NOCASE placement, the no-modify-existing rule, and the seed-name conflict gotchas. Trigger when the user says "add a migration", "new column", "alter table X", "create table for Y", "add a DB field", or similar. Also useful for writing the migration test that verifies the new schema.
---

# SQLite migration

How to add or modify schema in `src/server/db/migrations/` without breaking the codebase.

## File layout

- Path: `src/server/db/migrations/NNN_description.sql`
- Numbering: zero-padded 3-digit, sequential. Next number = `ls src/server/db/migrations/ | tail -1` + 1. Currently the highest is 022.
- Description: kebab-case, short. Examples: `021_partners.sql`, `022_category_sharing.sql`.

## The two patterns

### Pattern A: plain `ALTER TABLE ADD COLUMN` (preferred)

Works for **nullable columns** and **columns with literal defaults** (string, number, datetime expression).

```sql
ALTER TABLE categories
  ADD COLUMN sharing_type TEXT NOT NULL DEFAULT 'individual'
    CHECK(sharing_type IN ('individual', 'fixed', 'ratioed'));

ALTER TABLE transactions
  ADD COLUMN sharing_override TEXT
    CHECK(sharing_override IN ('individual', 'fixed', 'ratioed'));
```

Also fine for: `REAL NOT NULL DEFAULT 0.5`, `INTEGER DEFAULT 0`, `TEXT DEFAULT (datetime('now'))`.

### Pattern B: table-recreate (only when forced)

Required for: **adding a NOT NULL FK column without a default**. SQLite forbids `ALTER TABLE ADD COLUMN ... REFERENCES ... NOT NULL` in one shot.

```sql
CREATE TABLE bank_credentials_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- ... all existing columns ...
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL  -- the new column
);

INSERT INTO bank_credentials_new (id, workspace_id, ...)
  SELECT id, workspace_id, ... FROM bank_credentials;

DROP TABLE bank_credentials;
ALTER TABLE bank_credentials_new RENAME TO bank_credentials;

-- Recreate any indexes
CREATE INDEX idx_bank_credentials_workspace ON bank_credentials(workspace_id);
```

Reach for this pattern **only** when Pattern A is impossible. Don't use it to "clean up" existing tables — that's scope creep that bit us before.

## Hard rules

1. **Never modify an existing migration file.** Once a migration ships, it's frozen. Add a new one.
2. **`COLLATE NOCASE` goes in the column definition**, not in individual SELECT/UPDATE queries. Example: `name TEXT NOT NULL COLLATE NOCASE`.
3. **CHECK constraints with enum-like text** are encouraged. They self-document and catch bad data.
4. **Indexes:** add explicitly. `CREATE INDEX idx_<table>_<columns> ON <table>(...)`.
5. **Don't add columns to satisfy a weak test fixture.** If a test omits `workspace_id` on an insert and it fails, fix the test, not the schema. This is the lesson from F2 where the dev agent recreated `sync_runs` to give `workspace_id` a default — wrong fix.
6. **Seed updates that reference category names:** the seeded names in workspace 1 are `Groceries`, `Restaurants`, `Coffee & Cafes`, `Transport`, `Travel`, `Shopping`, `Entertainment`, `Personal Care`, `Sports & Hobbies`, `Bills & Utilities`, `Home`, `Insurance`, `Subscriptions`, `Health`, `Education`, `Kids & Childcare`, `Pet Care`, `Cash & ATM`, `Transfers`, `Gifts & Donations`. Parents: `Food`, `Transportation`, `Lifestyle`, `Home & Bills`, `Health & Family`, `Money Movement`. Use `COLLATE NOCASE` in `WHERE name IN (...)` updates. Do NOT reference names that aren't in this list — the UPDATE will silently match 0 rows.

## Migration auto-apply

Migrations run automatically on app start (`src/server/db/index.ts`). No manual step needed. Reset state for testing with `rm data/spent.db*`.

## Testing a migration

Pattern from existing tests in `src/__tests__/`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import type Database from "better-sqlite3";

describe("migration NNN", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("adds the new column with correct constraints", () => {
    const cols = db.prepare("PRAGMA table_info(<table>)").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const newCol = cols.find((c) => c.name === "<new_column>");
    expect(newCol).toBeDefined();
    expect(newCol!.notnull).toBe(1);
    expect(newCol!.dflt_value).toBe("'<default>'");
  });

  it("rejects invalid CHECK values", () => {
    expect(() => {
      db.prepare("INSERT INTO <table> (<col>) VALUES (?)").run("bogus");
    }).toThrow();
  });

  it("seed UPDATE matched the expected rows", () => {
    const rows = db
      .prepare("SELECT name FROM categories WHERE <new_col> = '<seeded_val>'")
      .all() as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(["<expected name 1>", ...]));
  });
});
```

`setupTestDb()` applies all migrations in order, so migration NNN runs as part of the suite.

## Common mistakes

- **Forgetting CHECK constraint:** an enum-like column without CHECK is a footgun. Always add it.
- **`DEFAULT` value type mismatch:** `REAL NOT NULL DEFAULT 0.5` is fine; `REAL NOT NULL DEFAULT '0.5'` is technically valid but ugly.
- **Index naming inconsistency:** stick to `idx_<table>_<columns>` for searchability.
- **Adding `created_at` / `updated_at` without trigger:** SQLite has no row-level triggers in migrations by default; `updated_at` must be set explicitly by query code on each UPDATE. Most existing tables follow this pattern.
- **Touching `sync_runs` schema for any reason except a real sync-related need.** Test fixtures must pass `workspace_id` explicitly.

## Output

When asked to add a migration, output:
1. The new file path and full SQL contents.
2. Any new test file (or addition to an existing test file) verifying the schema.
3. Any required changes to query files (raw row interface, `mapXRow` function, exported function signatures) — but DON'T write those yourself unless the request explicitly includes them. Flag them as follow-ups.
