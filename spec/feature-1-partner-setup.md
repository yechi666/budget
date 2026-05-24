# Feature 1 -- Partner Setup

## Goal

Introduce the concept of two partners (Yechi and Reni) into the app. Tag each connected bank/card account as belonging to one partner. This is the foundation all other couple-budget features depend on.

## Database changes

### New table: `partners`

```sql
CREATE TABLE partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);
```

Max two partners per workspace. Names entered by the user on first setup.

### Modified table: `bank_credentials`

```sql
ALTER TABLE bank_credentials
  ADD COLUMN partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL;
```

Each bank/card connection is tagged to one partner. Nullable -- untagged connections are treated as unassigned and excluded from balance calculations.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/partners` | List partners for the active workspace |
| POST | `/api/partners` | Create a partner (name) |
| PATCH | `/api/partners/:id` | Rename a partner |
| PATCH | `/api/integrations/:id` | Already exists -- add `partnerId` to the accepted body |

## UI: Settings > Partners (new page)

**Route:** `/settings/partners`

**Layout:**
- Two partner name fields (pre-filled if already set, empty on first visit).
- Below: list of all connected bank/card integrations, each with a dropdown ("Yechi" / "Reni" / "Unassigned").
- Unassigned integrations show a yellow warning badge.
- Save button persists all changes.

**First-time flow:**
- If no partners exist yet, the page shows a simple setup prompt: "Who uses this app? Enter both names to get started."
- Saving creates the two `partners` rows and redirects to the assignment list.

**Sidebar nav:** Add "Partners" entry under Settings, between "Bank" and "Categories".

## Acceptance criteria

- [ ] Partners table exists in DB after migration.
- [ ] Two partners can be created with custom names.
- [ ] Each bank/card integration can be assigned to a partner.
- [ ] Unassigned integrations are visually flagged.
- [ ] Partner names are editable after initial setup.
- [ ] Deleting a partner sets `partner_id = NULL` on their credentials (no data loss).
