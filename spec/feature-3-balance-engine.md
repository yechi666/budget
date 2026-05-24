# Feature 3 -- Balance Engine & Settlements

## Goal

Compute who owes whom based on shared transactions. Show the running balance on the home page. Provide a detail page with monthly breakdown and the ability to log settlements.

**Depends on:** Feature 1 (partner_id on credentials) and Feature 2 (sharing_type on categories).

## Database changes

### New table: `settlements`

```sql
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
```

## Balance computation

Computed on the fly from two sources -- no stored balance column.

### From shared transactions

For each non-excluded transaction where `credential.partner_id IS NOT NULL` and the effective sharing type is `fixed` or `ratioed`:

```
payer_partner  = credential.partner_id
other_partner  = the other partner
other_share    = charged_amount × fixed_ratio   (for 'fixed')
                 charged_amount × income_ratio  (for 'ratioed', see Feature 6)
balance_delta  = +other_share in payer_partner's favor
```

Effective sharing type = `transactions.sharing_override` if set, else `categories.sharing_type`.

### From settlements

```
balance_delta = -amount  (reduces what from_partner is owed by to_partner)
```

### Final balance

```
balance = SUM(all balance_deltas)
```

Positive balance = one partner is owed money. Display as: **"Reni is owed 1,240 ₪"** or **"You're even"**.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/balance` | Returns running balance + monthly breakdown |
| POST | `/api/balance/settlements` | Log a new settlement |
| GET | `/api/balance/settlements` | List settlements |
| DELETE | `/api/balance/settlements/:id` | Delete a settlement (mistake correction) |

### `GET /api/balance` response shape

```typescript
interface BalanceResponse {
  // Running total across all time
  runningBalance: number;        // positive = owedByPartner is owed this amount
  owedByPartnerId: number;       // the partner who owes
  owedToPartnerId: number;       // the partner who is owed

  // Per-month breakdown
  months: {
    month: string;               // "2025-04"
    label: string;               // "April 2025"
    sharedTotal: number;         // total shared expenses that month
    partnerAShare: number;
    partnerBShare: number;
    partnerAPaid: number;        // what partner A actually paid from their accounts
    partnerBPaid: number;
    netDelta: number;            // how much the balance shifted this month
  }[];

  settlements: Settlement[];
}
```

## UI: Home page balance card (new)

A compact card on the home page (alongside existing cards):

- **Balanced:** "You're even" with a green indicator.
- **Unbalanced:** "Reni is owed **1,240 ₪**" with a subtle arrow and a "Details" link.

## UI: Balance detail page (new -- `/balance`)

### Running total section
- Large display: "Reni is owed **1,240 ₪**" (or "You're even").
- "Log settlement" button -- opens a sheet/dialog.

### Log settlement dialog
- Fields: Amount (₪), Date (defaults to today), Note (optional).
- "Who paid?" -- select which partner transferred money to the other.
- On submit: creates a `settlements` row, balance recalculates instantly.

### Monthly breakdown table
Columns: Month | Shared expenses | Yechi paid | Reni paid | Yechi's share | Reni's share | Month delta

### Settlements history
List of logged settlements: date, amount, direction ("Yechi → Reni"), note. Delete button per row (with confirmation).

## Acceptance criteria

- [ ] `settlements` table exists after migration.
- [ ] `GET /api/balance` returns correct running balance from transactions + settlements.
- [ ] Balance correctly identifies payer via `credential_id → partner_id`.
- [ ] Transactions with `credential.partner_id = NULL` are excluded from balance.
- [ ] `sharing_override` on a transaction takes precedence over category sharing type.
- [ ] Home page balance card shows current balance.
- [ ] `/balance` page shows running total, monthly breakdown, and settlements history.
- [ ] Logging a settlement immediately updates the displayed balance.
- [ ] Deleting a settlement immediately updates the displayed balance.
