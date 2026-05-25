# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@STANDARDS.md

# Spent: project context

## Project context

Spent is a local-only personal finance tracker for Israeli financial institutions. It is an **open-source project** intended for users to self-host. The user is based in Israel, building this for personal use first and then publishing.

Key priorities (in order):
1. **Beautiful, comfortable UI** - this is a top concern. Don't ship anything that looks rough.
2. **Open-source friendly** - users should be able to clone, run, and customize without code edits.
3. **Security** - credentials encrypted at rest, never logged, server-only scraping.
4. **Extensibility** - architected for additional banks and AI providers from day one.

## Commands

```bash
npm run dev        # dev server on 127.0.0.1:3000 (Node 22+ required)
npm run build      # production build
npm run lint       # ESLint
```

Reset state: delete `data/spent.db*` and `data/.encryption-key`.

## Stack

- **Next.js 16** App Router. Server components by default; `"use client"` only where state/interactivity is needed.
- **TypeScript strict mode** - no `any` unless justified with a comment.
- **shadcn/ui v4 + base-ui** - `asChild` does NOT exist; use the `render` prop or style the primitive directly. Select `onValueChange` returns `string | null`, not `string`.
- **better-sqlite3** + **israeli-bank-scrapers** must stay in `serverExternalPackages` in `next.config.ts` (native bindings).
- **Tailwind CSS v4** - `@theme` directive in `globals.css`, not `tailwind.config.js`.
- **TanStack Query** on the client for all data fetching (`src/components/query-provider.tsx`).

## Conventions

- No em dashes anywhere in code, comments, docs, or commit messages.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Comments only where the "why" isn't obvious.
- `import "server-only"` at the top of every file in `src/server/`.

## Architecture

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `home-page.tsx` | Overview cards: cash flow, category snapshot, trend, recent txns, bank health |
| `/budget` | `dashboard.tsx` | Category grid with budget vs. actual, period selector |
| `/transactions` | `transactions-page.tsx` | Full transaction table with multi-filter |
| `/settings/*` | various | Bank integrations, AI config, categories, appearance, data |
| `/setup` | `setup-wizard.tsx` | First-run wizard |

### Workspace model

Every data table (`transactions`, `categories`, `budgets`, `bank_credentials`, `sync_runs`, etc.) has a `workspace_id` FK. A single DB instance can hold multiple isolated workspaces (e.g. Personal + Business, or two partners' finances).

- Active workspace is stored in a Zustand store (`src/lib/workspace-store.ts`) and sent as the `x-workspace-id` request header by `src/lib/api.ts` on every fetch.
- Server routes read the workspace from that header via `src/server/lib/workspace-context.ts`.
- AI provider settings stay global (per-machine, not per-workspace).

### Data flow

1. User completes setup wizard at `/setup`.
2. Bank credentials stored encrypted (`AES-256-GCM`) in `bank_credentials` table.
3. AI provider config stored in global `settings` table (Claude API key also encrypted).
4. User clicks "Sync Now" - SSE stream from `POST /api/sync`:
   - `src/server/sync/orchestrator.ts` drives the full sync per workspace.
   - Scraper wrapper in `src/server/scrapers/` fetches raw transactions.
   - Merchant memory (`src/server/lib/merchant-memory.ts`) applies known categorizations instantly before hitting AI.
   - Inserts with count-based dedup (`src/server/lib/dedup.ts`).
   - AI provider categorizes remaining uncategorized transactions in batches of 50.
5. Dashboard reads via API routes that all accept the `x-workspace-id` header.

### Key files

- `src/lib/types.ts` - all shared types, `BANK_PROVIDERS` array, `BankProvider` union type
- `src/lib/api.ts` - typed client-side fetch helpers; injects `x-workspace-id` header automatically
- `src/server/db/index.ts` - SQLite singleton (globalThis + WAL mode)
- `src/server/db/migrations/` - sequential SQL migrations (auto-applied on startup)
- `src/server/db/queries/transactions.ts` - dedup-on-insert, query/summary functions
- `src/server/db/queries/home.ts` - home page section queries (cash flow, bank health, etc.)
- `src/server/lib/encryption.ts` - AES-256-GCM helpers, auto-generates key file on first use
- `src/server/lib/merchant-memory.ts` - merchant-to-category lookup/write (skips AI for known merchants)
- `src/server/lib/workspace-context.ts` - reads `x-workspace-id` header in server routes
- `src/server/scrapers/index.ts` - error sanitization, maps provider to `CompanyTypes` enum
- `src/server/ai/factory.ts` - returns `ClaudeProvider`, `OllamaProvider`, or null
- `src/server/ai/prompts.ts` - categorization prompt shared between Claude and Ollama
- `src/server/sync/orchestrator.ts` - full sync pipeline per workspace
- `src/app/api/sync/route.ts` - SSE streaming sync endpoint
- `src/middleware.ts` - CSRF: blocks cross-origin POST/PATCH/DELETE to `/api/*`

### Category model

Categories have a two-level hierarchy (`parent_id`). `BudgetMode` is either `"budgeted"` (counts toward budget) or `"tracking"` (shown but not included in budget math). `BudgetSource` on `CategoryWithData` is `"own"` | `"rollup"` | `"leaf"` indicating whether the budget figure is the category's own, an aggregate of children, or inherited.

### Adding a new bank

1. Add to `BANK_PROVIDERS` in `src/lib/types.ts` with credential field schema.
2. Map to `CompanyTypes` enum in `src/server/scrapers/index.ts` `PROVIDER_MAP`.
3. Set `enabled: true`. Everything else flows through.

### Adding a new AI provider

1. Implement the `AIProvider` interface from `src/server/ai/types.ts`.
2. Add to `createAIProvider()` factory in `src/server/ai/factory.ts`.
3. Add provider option to setup wizard `src/components/setup/ai-step.tsx`.
4. Add settings key handling to `src/app/api/setup/ai/route.ts`.

## Testing without real bank credentials

Call the setup API directly from the browser console:

```typescript
fetch('/api/setup/bank', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'isracard',
    credentials: { id: 'test', card6Digits: '123456', password: 'test' }
  })
})
```

## Known quirks

- `israeli-bank-scrapers` uses Puppeteer with hardcoded `Asia/Jerusalem` timezone.
- Bank Yahav only supports 6 months of history.
- Most banks except OneZero do NOT support 2FA - users must disable it on the bank side.
- The `identifier` field is not reliably unique across banks; dedup uses `SHA-256(stable fields) + count sequence`.
- `claude-haiku-4-5-20251001` is the default Claude model. To upgrade, change in `src/server/ai/providers/claude.ts`.
- Migrations use table-recreate pattern (not `ALTER TABLE`) for adding FK columns, because SQLite forbids `ADD COLUMN ... REFERENCES ... NOT NULL`.
