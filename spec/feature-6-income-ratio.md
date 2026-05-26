# Feature 6 -- Income Ratio (`ratioed` sharing)

## Goal

Make the `ratioed` sharing type actually compute the split, instead of being a no-op as it is today. The split is each partner's share of total household income for the month.

**Depends on:** Feature 1 (partner_id on credentials), Feature 2 (sharing_type + sharing_override), Feature 3 (balance engine that already understands `ratioed` as a sharing type but currently treats it as 0).

## Why this is a separate feature

Income detection is fiddly: which transactions count as "income" varies per user. Doing it badly produces wrong balances silently. Better to ship the simpler `fixed` flow first (Features 1-3) and add `ratioed` once the rest of the couple-budget UI is in use and we have real-world data to sanity-check against.

## Israeli salary timing

In Israel, the salary for month M arrives on the **1st of month M+1** (or close to it). So when computing the ratio for transactions dated in April, the relevant salary deposits are dated 1 May. The same shift applies to monthly bonuses, freelance invoices, etc.

The ratio is therefore: **for transactions dated in month M, use income deposits dated in month M+1.**

Edge cases:
- Mid-month: a transaction dated 20 April still uses May 1st salary deposits.
- Multiple income deposits in M+1: sum them per partner.
- Missing income data (M+1 hasn't happened yet, or the sync hasn't pulled it): fall back to last-known ratio, or 50/50, with a UI warning.

## Database changes

### Migration 024: minimal — no new tables

```sql
-- We piggyback on existing transactions; just need a way to recognize
-- which categories count as "income" for ratio purposes.

ALTER TABLE categories
  ADD COLUMN counts_as_income INTEGER NOT NULL DEFAULT 0;
-- 1 = transactions in this category, when kind='income', contribute to
-- the partner's monthly income total for ratioed split math.
-- Default 0 keeps existing categories conservative; user opts in via
-- Settings > Categories.

-- Seed the obvious ones.
UPDATE categories
  SET counts_as_income = 1
  WHERE name IN ('Freelance & Side Income') COLLATE NOCASE
     OR kind = 'income';
```

Why a flag rather than relying on `kind='income'` alone: not every income row is salary. Refunds, interest, gift money, tax returns — these shouldn't pull the ratio. The flag lets the user mark exactly which streams count.

### `category_income_ratios` (optional cache table)

```sql
CREATE TABLE category_income_ratios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month TEXT NOT NULL,             -- 'YYYY-MM' (the transaction month, NOT the salary month)
  partner_a_income REAL NOT NULL,
  partner_b_income REAL NOT NULL,
  partner_a_ratio REAL NOT NULL,   -- partner_a_income / (a + b); 0.5 if both zero
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, month)
);
```

Optional: the math is cheap enough to recompute every balance query. Skip the cache table for v1; add later if it becomes a perf concern.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/balance/income-ratios` | Returns per-month income breakdown for the UI (debug/transparency). |
| PATCH | `/api/categories/:id` | Add `countsAsIncome: boolean` to the accepted body. |

## Balance engine extension

In `src/server/db/queries/balance.ts`:

1. **Fetch income totals per partner per month.** SQL:
   ```sql
   SELECT
     strftime('%Y-%m', t.date) AS month,
     bc.partner_id AS partner_id,
     SUM(t.charged_amount) AS total_income
   FROM transactions t
   JOIN bank_credentials bc ON t.credential_id = bc.id
   JOIN categories c ON t.category_id = c.id
   WHERE t.workspace_id = ?
     AND t.kind = 'income'
     AND c.counts_as_income = 1
     AND t.excluded = 0
     AND bc.partner_id IS NOT NULL
   GROUP BY month, bc.partner_id;
   ```

2. Build a `Map<month, { a: number, b: number, ratio_a: number }>` keyed by salary month. For each transaction dated month M, look up the entry for M+1 to get the ratio.

3. When `effectiveType === 'ratioed'`:
   - Determine the salary-month key: `addMonth(tx.date.slice(0,7), 1)`.
   - Look up the entry. If missing or both incomes are 0: fall back to `0.5` and emit a debug log (and surface as a UI warning in the monthly table).
   - Otherwise: `other_share = Math.abs(tx.charged_amount) * (payer === A ? (1 - ratio_a) : ratio_a)` — the non-payer's share.
   - Same direction logic as `fixed`.

4. Add `incomeRatioMonths: { month: string; partnerAIncome: number; partnerBIncome: number; partnerARatio: number; fallback: boolean }[]` to `BalanceResponse` so the UI can show the breakdown.

## UI changes

### Settings > Categories

Add a "Counts as income" toggle (per category) below the existing Sharing section. Only enabled when `kind === 'income'`. Help text: "Include this category in the income ratio used for shared-by-income expenses."

### `/balance` page

In the monthly breakdown table, when a row's transactions used the ratio, show a small badge "by income" next to "Shared %" with a hover tooltip showing the ratio used and the source month.

Add a small "Income ratios" expandable section under the monthly table:
- Each row: `{label}: {Partner A name} {amount} / {Partner B name} {amount} -> A's ratio {pct}%`.
- Rows where fallback was used: muted color + "(no data, defaulted to 50/50)" label.

### Settings > Categories sheet

When the user picks "Ratioed" in the Sharing section, drop the "(coming soon)" suffix from the label (Feature 2 currently shows it).

### Transactions page

The sharing chip for `ratioed` transactions ("Shared %") can now show a hover tooltip with the actual split: e.g. "Yechi 60% / Reni 40% (May 2025 income)".

## Acceptance criteria

- [ ] `counts_as_income` column exists; obvious income categories are seeded.
- [ ] PATCH /api/categories/:id accepts and persists `countsAsIncome`.
- [ ] Balance for a `ratioed` transaction in month M uses partners' income from month M+1.
- [ ] Falls back to 50/50 when M+1 has no income data, with a visible UI warning.
- [ ] Manual override (`sharing_override`) on a transaction still takes precedence over category type.
- [ ] Monthly breakdown table shows the ratio used per month.
- [ ] "(coming soon)" is removed from the Ratioed label everywhere it appears.
- [ ] Toggling a category as income immediately recomputes the balance and the affected months show the new ratio.
