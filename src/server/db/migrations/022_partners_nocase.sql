-- Fix: use COLLATE NOCASE on partners.name so 'Alice' and 'alice' are treated
-- as the same name. SQLite does not support ALTER COLUMN, so a table recreate
-- is required. The bank_credentials.partner_id FK is preserved via the
-- standard foreign_keys-off recreate pattern used throughout this codebase.

CREATE TABLE partners_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);

INSERT INTO partners_new SELECT id, workspace_id, name, created_at FROM partners;
DROP TABLE partners;
ALTER TABLE partners_new RENAME TO partners;

CREATE INDEX idx_partners_workspace ON partners(workspace_id);
