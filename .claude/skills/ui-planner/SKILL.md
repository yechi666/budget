---
name: ui-planner
description: Produces the detailed UI implementation plan for a Spent feature, AFTER an approved wireframe. Translates the wireframe into concrete shadcn/ui v4 + base-ui primitives, component tree, file paths, interaction states, i18n key candidates, and accessibility notes. Trigger when the user says "detailed UI plan for the wireframe", "expand the wireframe", "design the components", or invokes `/ui-planner`. Reads `.claude/pipeline/wireframe.md` as input.
---

# UI planner

Produce the **detailed UI implementation plan** for a Spent feature. Input: the wireframe at `.claude/pipeline/wireframe.md` (produced by the `wireframer` skill and approved by the user). Output: a markdown UI plan at `.claude/pipeline/ui-plan.md`.

The plan becomes part of the **feature-tester** contract (so tests target the planned UI) and the **feature-dev** brief (so the implementer builds to the plan, not their own interpretation).

## Invocation

```
/ui-planner
```

Always reads from `.claude/pipeline/wireframe.md`. If absent, ask the user to run `/wireframer` first.

## Required reading

1. The wireframe file: `.claude/pipeline/wireframe.md`.
2. The original spec (typically `spec/feature-N-*.md`) — for context the wireframe might have abbreviated.
3. `STANDARDS.md` (Glob to locate; may be at repo root or `docs/dev/`).
4. `CLAUDE.md`.
5. **Existing Spent UI components in the same family**, at least 3:
   - For pages: `src/components/home/home-page.tsx`, a page under `src/app/<route>/page.tsx`
   - For tables: `src/components/dashboard/transactions-table.tsx`
   - For sheets/dialogs: `src/components/settings/category-detail-sheet.tsx`, any `*-dialog.tsx`
   - For cards: `src/components/home/card-shell.tsx` + any specific card
   - For filters: `src/components/transactions/transaction-multi-filter.tsx`
6. `src/components/ui/` — the shadcn/ui v4 primitives. Glob for the ones your wireframe needs (Select, Popover, Dialog, etc.).
7. Existing i18n: `src/i18n/messages/en.json` and `he.json` — to see existing key conventions and to avoid duplicating keys.

## What the UI plan contains

Match the wireframe screen-by-screen. For each screen:

### Per-screen section

```markdown
## Screen: <name>

**Route:** `<path>` (e.g. `/balance`, `src/app/balance/page.tsx`)
**Server vs client:** server component shell → client component `<X>` for state

**File structure (new files only):**
- `src/app/balance/page.tsx` — server component shell
- `src/components/balance/balance-page.tsx` — `"use client"`, top-level layout
- `src/components/balance/balance-summary.tsx` — running total + log button
- ...

**Component tree:**
\`\`\`
<BalancePage>
  <PageHeader title meta>
  <Section "Summary">
    <BalanceSummary>
      <h1> "Reni is owed 1,240 ₪"
      <Button variant="primary" onClick={openDialog}> "Log settlement"
  <Section "Monthly breakdown">
    <MonthlyTable>
      <Table> ...
\`\`\`

**Primitives used:**
- shadcn `Card`, `Table`, `Dialog`, `Select`
- base-ui `Popover` (note: no `asChild`, use `render` prop)
- lucide-react icons: `Scale`, `ArrowRight`

**Interaction states:**
- Initial: loading skeleton matching the section structure (use `CardSkeleton`-style placeholder)
- Empty (no settlements + balance=0): "You're even" line + green dot, no table
- Error: card-level error message, no app crash
- Mutation in flight: button shows spinner; row optimistically updated

**State management:**
- TanStack `useQuery({ queryKey: ["balance"], queryFn: getBalance })`
- TanStack `useQuery({ queryKey: ["partners"], queryFn: listPartners })`
- Settlement dialog: local `useState` for open/closed; `useMutation` on submit

**Mutation invalidation after success:**
- `["balance"]`, `["transactions"]`, `["review"]`, `["review-count"]` (if mutation crosses domains)

**i18n keys to add** (new keys with proposed en/he strings):
| Key | English | Hebrew |
|---|---|---|
| `balance.cardTitle` | "Balance" | "יתרה" |
| ... | ... | ... |

**Accessibility:**
- Focus order: summary → log-settlement button → table → settlements list
- `aria-label` on icon-only buttons
- Live region for balance updates after settlement: `aria-live="polite"`

**Responsive:**
- Mobile (< md): monthly table collapses to per-month cards
- RTL: page reads right-to-left when locale is `he`; check `mt-`/`ms-` use (use logical properties: `ms-` / `me-` not `ml-` / `mr-`)
```

### Cross-screen sections

After the per-screen blocks, include:

**Shared components** (used by multiple screens) and where they live.

**Hooks/utilities to add** (e.g. a new `useBalanceFormatter`).

**Routing changes** (new entries in sidebar/nav, route guards).

**Design decisions justified** (when you picked between two reasonable options the wireframer left open): one bullet per decision with rationale.

## What you do NOT do

- Don't propose UI not in the approved wireframe. If you see something missing, list it under "Issues with wireframe" at the bottom and stop. The wireframer is the source of truth for what screens exist.
- Don't write actual React code. Component-tree pseudocode only.
- Don't pick test cases (the feature-tester does that, using your plan as input).
- Don't write the migration or query layer (the feature-planner already covered that).

## Spent-specific conventions to bake in

- **shadcn/ui v4:** no `asChild` prop. Use `render` or style the primitive directly. `Select.onValueChange` returns `string | null`, handle both.
- **Use `CardShell`** for card-shaped widgets on the home page. Other card-like surfaces use `rounded-xl border bg-card`.
- **Dynamic colors:** `text-[var(--status-on-track)]`, `text-[var(--status-over)]`. Never hardcoded hex outside of `globals.css`.
- **No inline styles** except for dynamic CSS variables (`style={{ "--color": value }}`).
- **`cn()`** from `@/lib/utils` merges class strings.
- **Logical properties** for RTL: `ms-` / `me-` not `ml-` / `mr-`, `ps-` / `pe-` not `pl-` / `pr-`.
- **TanStack Query** for all client data fetching. Query keys: `["resource"]` for lists, `["resource", id]` for single items.
- **Toast on mutation:** `toast.success(t("xxxUpdated"))` / `toast.error(...)`.
- **`import "server-only"`** in server components.

## Conventions for the plan text itself

- **No em dashes** anywhere (`--` or `—`). Use `:` or `;`.
- **i18n key naming:** namespace.camelCase (e.g. `balance.logSettlement`).
- **File paths in backticks.**
- **TypeScript snippets in fenced code blocks** when illustrating types.

## Hard rules

1. **One UI plan file only:** `.claude/pipeline/ui-plan.md`.
2. **Don't write production code.** Read-only on `src/`.
3. **Honor the wireframe.** Don't add screens or move structural decisions.
4. **Surface issues with the wireframe** at the bottom if you find them; don't paper over them.

## Output protocol

When done:
1. Path: `.claude/pipeline/ui-plan.md`.
2. One-paragraph summary of screens covered.
3. Count of new components, new i18n keys, new routes.
4. Decisions you made when the wireframe left two options open.
5. Any issues with the wireframe (gaps, contradictions with the spec).
6. Under 250 words.

The orchestrator hands the plan to the feature-tester (for test scaffolding) and then to the feature-dev (for implementation).
