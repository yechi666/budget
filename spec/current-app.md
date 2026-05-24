# Spent -- Current App Spec

## Purpose

Spent is a self-hosted, local-only personal finance tracker for Israeli banks and credit cards. It runs entirely on the user's machine (no cloud, no accounts, no telemetry). It scrapes bank websites via Puppeteer, categorizes transactions with AI, and presents a budget dashboard.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router (Node 22+) |
| Language | TypeScript strict mode |
| UI | shadcn/ui v4 + base-ui (no `asChild`; use `render` prop) |
| Styling | Tailwind CSS v4 (`@theme` in globals.css) |
| Database | better-sqlite3 (WAL mode, SQLite) |
| Scraping | israeli-bank-scrapers (Puppeteer) |
| Client data | TanStack Query |
| Encryption | AES-256-GCM (auto-generated key file) |

---

## Database schema

All tables except `settings` are scoped by `workspace_id`.

### Global

| Table | Purpose |
|---|---|
| `settings` | Global key/value store: AI provider, API keys (encrypted) |

### Per-workspace

| Table | Key columns | Notes |
|---|---|---|
| `workspaces` | id, name, slug | Partitions all user data |
| `workspace_settings` | workspace_id, key, value | Per-workspace settings: months_to_sync, payday_day, scraper_show_browser |
| `bank_credentials` | id, workspace_id, provider, label, credentials_encrypted, iv, auth_tag, requires_manual_two_factor | AES-256-GCM encrypted. Multiple credentials per provider allowed (distinguished by label). |
| `categories` | id, workspace_id, parent_id, name, color, icon, kind, budget_mode, description | Two-level hierarchy. `kind`: expense/income. `budget_mode`: budgeted/tracking. |
| `budgets` | id, workspace_id, category_id, monthly_amount, is_auto | One row per category. `is_auto` means the app set it based on history. |
| `transactions` | id, workspace_id, account_number, date, charged_amount, description, category_id, category_source, ai_confidence, provider, credential_id, sync_run_id, dedup_hash, dedup_sequence, kind, needs_review, is_excluded | `kind`: expense/income/transfer. Dedup via SHA-256 hash + sequence counter. |
| `sync_runs` | id, workspace_id, credential_id, provider, started_at, status, transactions_added | One row per scrape attempt. |
| `merchant_categories` | workspace_id, merchant_key, category_id, source, hit_count | Merchant memory: skips AI for known merchants. |
| `category_corrections` | workspace_id, transaction_id, old_category_id, new_category_id | Tracks user corrections to AI categorization. |
| `excluded_merchants` | workspace_id, provider, merchant_key | Merchants whose transactions are hidden from budget calculations. |

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Home -- overview cards: this month summary, cash flow (income vs expenses), category snapshot, historical trend, recent transactions, top merchants, needs-attention count, bank health |
| `/budget` | Dashboard -- category grid with budget vs actual, period selector, sync button, categorize button |
| `/transactions` | Full transaction table with category multi-filter, sort, search |
| `/setup` | First-run wizard (3 steps: bank, AI, done) |
| `/settings/bank` | Add / edit / remove bank connections. Per-connection: label, 2FA flag, re-auth |
| `/settings/ai` | AI provider: Claude (API key) / Ollama (URL + model) / none |
| `/settings/categories` | Create, rename, recolor, delete, organize hierarchy, set budget mode |
| `/settings/general` | Payday day, months to sync, auto-sync schedule |
| `/settings/appearance` | Theme (light/dark/system) |
| `/settings/data` | Export / reset data |

---

## Core feature flows

### First-run setup
1. `/setup` wizard: user picks bank, enters credentials, optionally configures AI.
2. Credentials encrypted and stored in `bank_credentials`.
3. AI config stored in global `settings`.

### Sync
1. User clicks "Sync Now" (or auto-sync fires).
2. `POST /api/sync` opens an SSE stream.
3. `src/server/sync/orchestrator.ts` runs per-workspace:
   - Decrypts credentials, calls `scrapeBank()` (Puppeteer).
   - Inserts raw transactions with dedup (SHA-256 hash + count sequence prevents duplicates across re-syncs).
   - Merchant memory lookup -- applies known category instantly, skips AI.
   - AI provider categorizes remaining uncategorized transactions in batches of 50.
4. SSE stream emits progress events; client shows a progress dialog.

### Categorization
- **AI**: Claude or Ollama. Prompt in `src/server/ai/prompts.ts` (shared). Default model: `claude-haiku-4-5-20251001`.
- **Merchant memory**: `merchant_categories` table. After a user corrects a category, the merchant key is stored so future transactions from the same merchant are auto-categorized without AI.
- **Manual**: User can re-categorize any transaction in the transactions table.
- AI confidence score stored per transaction. Low-confidence transactions flagged as `needs_review`.

### Budget tracking
- Each category has an optional monthly budget (`budgets` table).
- `is_auto = 1`: app computed it from historical average.
- Dashboard compares actual spend vs budget per category per period.
- Budget statuses: `plenty-left` / `on-track` / `heads-up` / `over`.

### Workspace model
- All data is scoped by `workspace_id`.
- Active workspace stored in a Zustand store (`src/lib/workspace-store.ts`).
- Every client-side API call sends `x-workspace-id` header; server reads it in `src/server/lib/workspace-context.ts`.
- AI provider settings are global (per-machine), not per-workspace.

### Supported banks and cards

**Banks:** Hapoalim, Leumi, Mizrahi Tefahot, Discount, Mercantile, First International (FIBI), Otsar Hahayal, Union, Pagi, Yahav, Massad, One Zero

**Cards:** Isracard, Visa Cal, Max (formerly Leumi Card), American Express IL, Beyahad Bishvilha, Behatsdaa

### 2FA handling
- **Manual**: `requires_manual_two_factor` flag on a credential triggers `showBrowser = true` for that provider. User solves the 2FA in the visible browser window.
- **Programmatic**: One Zero only. SMS OTP token stored (encrypted) inside the credentials blob.

### Transaction deduplication
`dedup_hash = SHA-256(accountNumber + date + description + originalAmount + originalCurrency)`. A `dedup_sequence` counter handles multiple transactions with identical fields (e.g. two identical charges on the same day). `ON CONFLICT ... DO UPDATE` keeps pending transactions updatable.

### Transfer detection
`src/server/lib/transfers.ts` detects internal transfers between accounts (same amount, opposite direction, close dates) and marks them `kind = 'transfer'` so they're excluded from expense totals.

### Security
- Credentials never logged. Error messages strip 5+ digit numbers and credential fields.
- Same-origin CSRF enforcement in `src/middleware.ts` (blocks cross-origin POST/PATCH/DELETE to `/api/*`).
- Strict CSP, `X-Frame-Options: DENY`.
- App binds to `127.0.0.1` only.

---

## Known limitations (current)

- No multi-user / auth -- single local user per installation.
- No per-transaction "whose expense is this" concept (Yechi vs Reni).
- No shared expense tracking or balance between people.
- Category filter on transactions page is the only filter (no filter by account/bank).
- Hebrew UI not yet implemented (English only).
