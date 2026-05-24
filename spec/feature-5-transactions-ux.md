# Feature 5 -- Transactions UX

## Goal

Make sharing data visible inline in the transactions table and add a partner/account filter so users can view one person's transactions at a time.

**Depends on:** Feature 1 (partner_id on accounts) and Feature 2 (sharing_type on categories).

## UI changes

### New column: Sharing

Added to the transactions table between the Category and Amount columns.

Displays a small chip per row:

| Effective sharing type | Chip |
|---|---|
| `individual` | No chip (blank -- keeps the table clean) |
| `fixed` | "Shared" chip (neutral color) |
| `ratioed` | "Shared %" chip (distinct color) |
| `sharing_override` set | Same chip as above but with an edit icon to indicate it was manually overridden |

Clicking the chip opens a small popover with:
- Current sharing type (read from override or category).
- Quick-change options: Individual / Shared (fixed) / Ratioed.
- Saving writes `sharing_override` on the transaction via `PATCH /api/transactions/:id`.

### New filter: Account / Partner

Added to the existing filter bar alongside the category filter.

**Options:**
- All accounts (default)
- Yechi -- shows transactions from all accounts assigned to Yechi
- Reni -- shows transactions from all accounts assigned to Reni
- Individual accounts -- one option per connected bank/card (e.g. "Yechi -- Otsar Hahayal", "Reni -- Isracard")

Selecting a partner option filters by all `credential_id`s where `credential.partner_id = selected_partner`.

### Review flag

Transactions present in the review queue show a small flag icon at the start of the row. Clicking it navigates to `/review` filtered to that transaction.

## API changes

The existing `GET /api/transactions` route needs two new query params:

| Param | Type | Behaviour |
|---|---|---|
| `partnerId` | number | Filter to transactions from credentials assigned to this partner |
| `credentialId` | number | Filter to transactions from one specific credential |

## Acceptance criteria

- [ ] Sharing chip is visible for all `fixed` and `ratioed` transactions.
- [ ] `individual` transactions show no chip (not cluttered).
- [ ] Clicking the chip opens a popover and saves the override correctly.
- [ ] Partner filter shows Yechi / Reni options (only if partners are configured).
- [ ] Filtering by partner shows only transactions from their assigned accounts.
- [ ] Filtering by specific account works independently of the partner filter.
- [ ] Review flag icon appears on transactions in the review queue.
- [ ] Clicking the flag navigates to `/review`.
