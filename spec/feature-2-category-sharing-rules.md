# Feature 2 -- Category Sharing Rules

## Goal

Tag each expense category as `individual`, `fixed` (50/50), or `ratioed` (by income). Allow per-transaction overrides. Seed sensible defaults for existing categories.

**Depends on:** Feature 1 (partners must exist for the concept of sharing to be meaningful, though the DB change is independent).

## Database changes

### Modified table: `categories`

```sql
ALTER TABLE categories
  ADD COLUMN sharing_type TEXT NOT NULL DEFAULT 'individual'
    CHECK(sharing_type IN ('individual', 'fixed', 'ratioed'));

ALTER TABLE categories
  ADD COLUMN fixed_ratio REAL NOT NULL DEFAULT 0.5;
-- fixed_ratio: the non-payer's share (0.5 = 50/50).
-- Used only when sharing_type = 'fixed'. Ignored for 'ratioed' (ratio computed from income).
```

### Modified table: `transactions`

```sql
ALTER TABLE transactions
  ADD COLUMN sharing_override TEXT
    CHECK(sharing_override IN ('individual', 'fixed', 'ratioed'));
-- NULL = inherit from category. Non-null overrides the category sharing_type for this transaction only.
```

## Seeded defaults

Applied as part of the migration for existing categories:

| Sharing type | Categories |
|---|---|
| `fixed` | Groceries, Dining & Restaurants, Fuel, Utilities (electricity, water, internet, arnona), Rent, Subscriptions (streaming shared between both), Household & Maintenance |
| `individual` | Insurance, Medical & Health, Clothing, Personal care, Education, Transportation (individual), Entertainment (personal) |

All other categories default to `individual` (the column default). Users can change any of these in Settings.

## API changes

| Method | Route | Change |
|---|---|---|
| PATCH | `/api/categories/:id` | Accept `sharingType` and `fixedRatio` in body |
| PATCH | `/api/transactions/:id` | Accept `sharingOverride` in body |

## UI: Settings > Categories (updated)

Add a **Sharing** column to the categories table:

- Displays a select: `Individual` / `Fixed (50/50)` / `Ratioed`.
- For `fixed`, show a secondary input for the ratio if it's not 50/50 (edge case, optional for v1 -- can default to 50/50 always).
- When changing a **parent** category's sharing type, show a confirmation: "Apply to all X subcategories too?"
- New categories default to `Individual`.

## Acceptance criteria

- [ ] `sharing_type` and `fixed_ratio` columns exist on `categories` after migration.
- [ ] `sharing_override` column exists on `transactions` after migration.
- [ ] Seeded defaults applied correctly to existing categories.
- [ ] Sharing type is editable per category in Settings > Categories.
- [ ] Changing a parent's type offers to propagate to children.
- [ ] Per-transaction override is persisted via PATCH `/api/transactions/:id`.
- [ ] `ratioed` type is available in the UI but labeled as "Coming soon" or similar until Feature 6.
