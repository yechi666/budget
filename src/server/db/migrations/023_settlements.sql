CREATE TABLE settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_partner_id INTEGER NOT NULL REFERENCES partners(id),
  to_partner_id INTEGER NOT NULL REFERENCES partners(id),
  amount REAL NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_settlements_workspace ON settlements(workspace_id);
