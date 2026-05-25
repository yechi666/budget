-- Partners: tag each partner (up to 2 per workspace) so bank/card accounts
-- can be assigned to an owner. Foundation for couple-budget features.

CREATE TABLE partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_partners_workspace ON partners(workspace_id);

-- partner_id is nullable: unassigned connections are excluded from balance
-- calculations. SQLite allows ADD COLUMN with a nullable FK reference.
ALTER TABLE bank_credentials
  ADD COLUMN partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL;
