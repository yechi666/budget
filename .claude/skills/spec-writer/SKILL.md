---
name: spec-writer
description: Drafts a single feature spec file in spec/feature-N-*.md format for the Spent codebase. Trigger when the user says "draft a spec for X", "write spec for feature N", "spec out this idea", or invokes `/spec-writer`. Read-only on code; writes only the new spec file. Not for batch breakdowns — for that use `plan-feature`.
---

# Spec writer

Draft a SINGLE feature spec in the **Spent** codebase. Output goes to `spec/feature-N-<kebab-name>.md`. The spec is a contract for downstream tooling (feature-planner, feature-tester, feature-dev) — get it right.

This is NOT the tool for breaking a big idea into multiple sub-features. The `plan-feature` skill handles that. You write ONE spec for ONE feature.

## Invocation

```
/spec-writer <brief>
```

The brief is a free-text description of the feature. If the user invokes without a brief, ask for one.

## Required reading before writing

1. **Existing specs in `spec/`** — read at least 2 of `feature-1-partner-setup.md`, `feature-3-balance-engine.md`, `feature-6-income-ratio.md` to absorb the format. They are the ground truth for layout, level of detail, and tone.
2. `spec/couple-budget-overview.md` if your spec is part of that family (cross-feature context, dependencies, decisions table).
3. `CLAUDE.md`, `STANDARDS.md`, `AGENTS.md` at repo root.
4. `src/lib/types.ts` to ground type references.
5. Any code mentioned in the brief — read enough to verify the spec doesn't reference things that don't exist (categories not seeded, columns not in the schema, etc.).

## File naming and numbering

- Path: `spec/feature-<N>-<kebab-name>.md`
- N is the next sequential number. Find it via `ls spec/feature-*.md`.
- Kebab name describes the feature in 2-4 words: `partner-setup`, `balance-engine`, `income-ratio`, `bit-integration`.

## Required sections (in this order)

Use markdown `#` for the title, `##` for sections. Tables where they fit naturally (API routes, sharing types, etc.). SQL in fenced code blocks. Inline code for identifiers.

1. **Title** — `# Feature N: <Title>` (use a colon, not a dash separator).
2. **Goal** — one or two paragraphs. Why this exists; what the user can do after it ships.
3. **Depends on** — line of the form `**Depends on:** Feature X (reason), Feature Y (reason).` Skip if no dependencies.
4. **Database changes** — every new table, every altered column, every seed UPDATE. SQL in fenced blocks. If no DB changes, state that explicitly (don't omit).
5. **API changes** — markdown table of `Method | Route | Purpose`. For routes with non-trivial bodies, include a TypeScript interface for the body and response shape in fenced code.
6. **UI changes** — by route or by component. Describe layout, key UX decisions (popovers, dialogs, optimistic updates). Note new pages with their route. If client-heavy, call it out so the orchestrator knows to verify in a browser.
7. **Acceptance criteria** — markdown checklist (`- [ ]`). Each item is concrete and testable: "DB column X exists with default Y", not "DB is correct". Aim for 5-10 items.

## Optional sections (include when they apply)

- **Motivation / Why this is separate** — if the spec is part of a series and there's a non-obvious reason it's not folded into another feature.
- **Algorithm** — for balance/computation features, pseudocode or step-by-step explanation. Use this when the API description alone won't make the logic clear.
- **Sharing model** or **detection rules** — domain-specific decision tables.
- **Risk and rollback** — for features touching sync, scrapers, or anything that could corrupt user data.
- **Decisions** — bulleted list of choices made during spec drafting that the user should sanity-check (e.g. "Settlements: manual only in v1, auto-detect deferred to Feature N+1").

## Open questions

If your brief is ambiguous, do NOT go back to the user. Make a reasonable assumption, document it under a **Decisions** or **Open questions** section, and flag it for orchestrator review. Examples that have come up:

- Brief says "categorize X as fixed sharing" but the category name X isn't seeded → assume the closest seeded name, note the substitution.
- Brief says "add a flag to table T" but T doesn't have a workspace_id (e.g. global settings) → flag the design question.
- Brief implies a UI without specifying which page → propose a location, note alternatives.

## Conventions (apply to the spec text itself)

- **No em dashes** (`--` or `—`) anywhere — including the title, section headers, and prose. Use `:` or `;` as separators. Use parentheses for asides.
- Acceptance criteria are a markdown checklist (`- [ ]`), not prose, not numbered.
- SQL in fenced ` ```sql ` blocks.
- TypeScript snippets in fenced ` ```typescript ` blocks.
- File paths in backticks: `src/server/db/queries/balance.ts`.
- Israeli context where relevant (NIS amounts, Hebrew description patterns, salary-on-1st convention).

## Spec-deviation discipline

Before you write any reference to a category name, column, route, or i18n key, verify it exists. Common gotchas:

- **Seeded category names** are: Groceries, Restaurants, Coffee & Cafes, Transport, Travel, Shopping, Entertainment, Personal Care, Sports & Hobbies, Bills & Utilities, Home, Insurance, Subscriptions, Health, Education, Kids & Childcare, Pet Care, Cash & ATM, Transfers, Gifts & Donations. Parents: Food, Transportation, Lifestyle, Home & Bills, Health & Family, Money Movement. Don't reference names outside this list without flagging.
- **Migration NOT NULL FK adds** need the table-recreate pattern; if your spec calls for one, mention this in the DB section so the implementer doesn't reach for the simple ALTER.
- **`categories.sharing_type` is NOT NULL with default 'individual'.** Don't propose triggers/conditions that require it to be NULL.
- **Expenses are stored as negative numbers** in `charged_amount`. Don't write algorithms that assume positive.

## Hard rules

1. **You write ONE file**: the new spec at `spec/feature-N-<kebab>.md`. Don't touch other spec files. Don't touch the overview file unless explicitly asked.
2. **You don't write production code or tests.** Read-only on `src/`.
3. **You don't make decisions on behalf of the user** — surface them under "Decisions" or "Open questions".
4. **You don't run any tool or app** beyond reading the codebase.

## Output protocol

When done, your final message:
1. Path of the new spec file.
2. One-paragraph summary of what it covers.
3. List of any open questions / decisions surfaced for orchestrator review (with line references).
4. Any spec-deviation concerns flagged (e.g. "brief mentioned X but it doesn't exist; substituted Y").
5. Under 200 words total.
