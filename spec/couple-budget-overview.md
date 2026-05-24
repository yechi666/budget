# Couple's Budget -- Overview

## Context

Two partners (Yechi and Reni) use the app together on one machine, one workspace. They connect all their accounts -- each partner's bank account(s) and credit card(s) -- and want to:

1. Know which expense categories are individual vs shared.
2. For shared expenses, know who paid and calculate each partner's owed share.
3. Track a running balance of how much one partner owes the other.
4. Log settlements (Bit transfers) when they square up.
5. Review transactions the app is uncertain about.

## Sharing model

Every transaction has a sharing type, inherited from its category (overridable per transaction):

| Type | Split | Current status |
|---|---|---|
| `individual` | No split. Belongs to whoever paid. | Active |
| `fixed` | 50/50 always. | Active |
| `ratioed` | By each partner's income ratio for that month. | Built but inactive (see Feature 6) |

**Balance impact:** When a shared transaction is paid from one partner's account, the other partner owes their share. The balance accumulates until a settlement is logged.

Example: Reni's card shows a 1,300 ₪ grocery charge (Groceries → fixed 50/50). Yechi owes Reni 650 ₪. The running balance increases by 650 ₪ in Reni's favor.

## Feature list

| # | Feature | Depends on |
|---|---|---|
| 1 | [Partner setup](feature-1-partner-setup.md) | -- |
| 2 | [Category sharing rules](feature-2-category-sharing-rules.md) | Feature 1 |
| 3 | [Balance engine & settlements](feature-3-balance-engine.md) | Features 1, 2 |
| 4 | [Review queue](feature-4-review-queue.md) | Features 1, 2 |
| 5 | [Transactions UX](feature-5-transactions-ux.md) | Features 1, 2 |
| 6 | Income ratio (`ratioed` type) | Features 1, 2, 3 |
| 7 | Bit integration (auto-detect settlements) | Feature 3 |

## Decisions

- **Settlements:** Logged manually. Auto-detection via Bit is Feature 7 (future).
- **Category sharing type changes:** Balance is always recomputed from the current category sharing type. Changing a category retroactively affects all its transactions.
- **Review queue threshold:** No amount threshold. Only low-confidence AI categorizations trigger the queue.
- **Salary timing:** In Israel, April's salary arrives on May 1st. The ratio for month M uses salary deposits from month M+1.
