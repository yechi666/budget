# Feature 4 -- Review Queue

## Goal

Surface transactions that need a human decision in a dedicated page. Show a badge count in the sidebar nav. Let the user resolve each item with quick actions.

**Depends on:** Feature 1 (partner_id) and Feature 2 (sharing_type) to cover sharing-related triggers. The category-confidence trigger (`needs_review`) already exists in the DB.

## What triggers the review queue

A transaction appears in the queue when any of the following are true:

| Trigger | Condition | Action needed |
|---|---|---|
| Low AI confidence | `needs_review = 1` | Confirm or change category |
| Unknown payer on shared expense | `category.sharing_type != 'individual'` AND `credential.partner_id IS NULL` | Assign account to a partner (links to Settings > Partners) |
| Sharing rule undefined | `sharing_override IS NULL` AND `category.sharing_type` is not set (newly created category with no sharing rule) | Set sharing type for the category |

Transactions are removed from the queue when all triggers that put them there are resolved.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/review` | List transactions in the review queue with their trigger reasons |
| POST | `/api/review/:id/resolve` | Resolve a transaction (accepts category, sharingOverride, or just a confirm) |

### `GET /api/review` response shape

```typescript
interface ReviewItem {
  transaction: TransactionWithCategory;
  triggers: ('low-confidence' | 'unknown-payer' | 'no-sharing-rule')[];
  suggestedCategoryId: number | null;
  suggestedSharingType: 'individual' | 'fixed' | 'ratioed' | null;
}

type ReviewResponse = ReviewItem[];
```

## UI: Sidebar nav badge

- A numeric badge on the "Review" nav item showing the count of pending transactions.
- Badge is hidden when count is 0.
- Updates after each resolution.

## UI: Review queue page (`/review`)

### Layout
- List of flagged transactions, most recent first.
- Each row shows: date, merchant/description, amount, account (which partner's card/bank), current category (or "Uncategorized"), trigger reason(s).

### Per-item quick actions

Shown inline or in an expanded row:

| Action | When shown | Effect |
|---|---|---|
| **Confirm** | Category is suggested | Marks `needs_review = 0`, keeps category |
| **Change category** | Always | Opens category picker, saves selection, marks resolved |
| **Mark individual** | Sharing trigger | Sets `sharing_override = 'individual'` on the transaction |
| **Go to Partners settings** | Unknown payer trigger | Links to `/settings/partners` to assign the account |

Resolving an item removes it from the list with a brief animation. The nav badge count decrements immediately.

### Empty state
"All caught up. No transactions need your attention." with a checkmark illustration.

## Acceptance criteria

- [ ] `/api/review` returns all transactions matching any trigger condition.
- [ ] `needs_review = 1` transactions appear in the queue.
- [ ] Transactions with shared category but unassigned account appear in the queue.
- [ ] Resolving a transaction via any quick action removes it from the list.
- [ ] Nav badge shows the correct count and disappears when queue is empty.
- [ ] "Go to Partners settings" deep-links correctly.
- [ ] Confirming a category sets `needs_review = 0` and `category_source = 'user'`.
