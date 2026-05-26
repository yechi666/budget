# Feature 7 -- Bit Integration (auto-detect settlements)

## Goal

When a partner pays the other via **Bit** (Israel's dominant P2P payment app), automatically create a `settlements` row so the balance updates without the user having to log it manually. Today (Feature 3) every settlement is entered by hand.

**Depends on:** Feature 3 (the `settlements` table + balance engine that consumes it).

## Motivation

Settlements between partners are real, frequent events ("you bought groceries this week, here's 300 to even up"). Asking the user to mirror every Bit transfer into the app is the friction-iest part of the couple-budget flow. Auto-detection makes the running balance trustworthy without manual upkeep.

## What Bit transfers look like in scraper output

Bit transfers appear in the bank scraper output as:
- **Sender side:** a debit transaction on the sender's card / current account. Description typically contains `ביט` or `BIT` or `PAYBOX BIT` (varies by bank). The Hebrew form is the strong signal.
- **Receiver side:** a credit transaction on the receiver's current account. Description also contains `ביט`/`BIT`/`PAYBOX`.

Exact strings differ by issuer (Isracard, Max, banks). We must collect a few real-world examples during dev to nail the regex / keyword list.

## Detection algorithm

For each sync, after dedup and categorization, run a "Bit reconciliation" pass:

1. **Identify Bit-tagged transactions** within the workspace's last N days (N=30 default):
   - `description` matches the Bit keyword list (regex per provider, accumulated empirically).
   - OR `categoryId` is the user-confirmed "Bit transfer" category (we may seed one).
2. **Within Bit-tagged transactions**, find pairs:
   - One debit on partner A's credential, one credit on partner B's credential (or vice versa).
   - Amounts match in absolute value (allow ±0.01 ₪ rounding tolerance).
   - Dates within 2 days of each other (Bit usually clears same-day but bank processing can shift the credit by one business day).
   - Neither transaction is already linked to a settlement.
3. **Materialize a settlement** for each matched pair:
   - `from_partner_id` = the debit's partner
   - `to_partner_id` = the credit's partner
   - `amount` = the matched amount
   - `date` = the earlier of the two transaction dates
   - `note` = `"Auto-detected Bit transfer"` (i18n key)
4. **Link the transactions to the settlement** via a new join table (see DB changes).
5. **Mark both transactions as excluded** from the balance computation (their effect is the settlement itself; counting them again would double-pay).

## Database changes

### Migration 025

```sql
-- Link table: each Bit-side transaction can be linked to at most one
-- auto-detected settlement, and a settlement can reference up to two
-- transactions (the debit and the credit).
CREATE TABLE settlement_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  settlement_id INTEGER NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK(side IN ('debit', 'credit')),
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, transaction_id)
);

CREATE INDEX idx_settlement_transactions_settlement
  ON settlement_transactions(settlement_id);

-- Source flag on settlements so the UI can render auto-detected ones
-- differently and so the orchestrator skips reprocessing them.
ALTER TABLE settlements
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual', 'bit-auto'));

-- One-time backfill is unnecessary because no auto-detected
-- settlements existed before this migration.
```

### `bit_keywords` (optional config)

If we don't want regex hard-coded, store the keyword list in `settings`:

```sql
-- key: 'bit_keywords'
-- value (JSON): ["ביט", "BIT", "PAYBOX", "BITPAY"]
```

User can edit via Settings > Data > Bit detection. Probably overkill for v1; hard-code first, externalize later.

## Sync orchestrator change

In `src/server/sync/orchestrator.ts`, after dedup + AI categorization (current end-of-sync), add a step:

```
detectBitSettlements(workspaceId)
```

This function:
- Runs the detection algorithm above.
- Inserts settlements + link rows in a single DB transaction per match.
- Emits an SSE event per match: `{ type: 'bit-settlement-detected', settlement, transactions: [debitId, creditId] }` so the UI can toast "Auto-detected: Yechi paid Reni 300 ₪".
- Logs each match for audit; never fails the sync — detection errors are warnings.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/balance/settlements` | (existing) Add a `source` field per settlement in the response. |
| DELETE | `/api/balance/settlements/:id` | (existing) When deleting an auto-detected settlement, also un-exclude the linked transactions (so they go back into the balance). The user is saying "this isn't really a settlement". |
| POST | `/api/balance/bit-redetect` | New: re-run detection across the last N days. For users who unlinked something accidentally or want to force a sweep. |

## Balance engine touch-up

In `getBalance`, exclude transactions that appear in `settlement_transactions` from the shared-expense math (they're already accounted for via the settlement). This is in addition to the existing `excluded = 1` filter.

```sql
AND t.id NOT IN (
  SELECT transaction_id FROM settlement_transactions WHERE workspace_id = ?
)
```

## UI changes

### `/balance` page

- **Settlements list:** auto-detected rows get a small `Sparkles` icon (or similar) and a tooltip "Auto-detected from Bit transfer". Manual rows stay as-is.
- **Delete confirmation:** for auto-detected settlements, dialog body says "The linked Bit transactions will go back into the running balance." (Manual settlements show the existing dialog.)
- **New banner / toast:** when a sync run detects new Bit settlements, surface a brief toast: "Auto-logged 1 settlement from Bit."

### Transactions page

- Transactions that are part of an auto-detected settlement show a subtle inline badge: `linked to settlement` with a hover that shows the date and amount.
- These rows are visually de-emphasized (muted) to indicate they don't contribute to category totals.

### Settings > Data

- New section "Bit detection":
  - Toggle: "Auto-detect Bit transfers as settlements" (default ON for new workspaces, can be turned off if the heuristic misbehaves).
  - Button: "Re-detect Bit transfers" (calls `POST /api/balance/bit-redetect`).
  - Last detection result: "Last run found 3 new settlements on May 14".

## Risk and rollback

- **Wrong match:** the heuristic could pair two unrelated Bit transfers if both happen on the same day for the same amount. Mitigations:
  - Require the partner_ids to be different (already required since we look for cross-partner pairs).
  - Skip pairs where both transactions have already been categorized as something other than 'transfer' by the user.
  - Always honor `excluded = 0` on a settlement-linked transaction if the user explicitly unexcludes it (manual override wins).
- **Bit string drift:** keywords change over time. Surface the keyword list in Settings so the user can edit.
- **User opt-out:** the toggle in Settings > Data lets users disable detection without uninstalling the feature.

## Acceptance criteria

- [ ] `settlement_transactions` table and `settlements.source` column exist after migration.
- [ ] After a sync that ingests a matched Bit debit + credit, a `settlement` is auto-created with `source = 'bit-auto'`.
- [ ] The linked transactions are excluded from the shared-expense math (don't double-count).
- [ ] Deleting an auto-detected settlement re-includes the linked transactions in the balance.
- [ ] Toast on the home/sync UI announces new auto-detected settlements.
- [ ] `/balance` page settlements list shows the auto-detected indicator.
- [ ] Settings > Data has a toggle and a manual re-detect button.
- [ ] Detection failures are logged but never abort the sync.
