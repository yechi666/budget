---
name: feature-planner
description: Plans the implementation of a single feature in the Spent codebase against an existing spec. Reads a spec from spec/feature-N-*.md and produces a structured plan (migration SQL, types, queries, API, UI, i18n, tests, open questions). Trigger when the user says "plan this feature", "plan the implementation of X", "how would we build feature N", or invokes `/feature-planner`. Distinct from `plan-feature`, which splits a big idea into multiple sub-specs; this plans ONE already-specced feature.
---

# Feature planner

Produce the implementation plan for ONE already-specced feature in the **Spent** codebase (`C:\Users\yechi\git-repos\budget`).

## Invocation

```
/feature-planner <spec-path>
```

The spec is typically `spec/feature-N-*.md`. If the user didn't provide one, glob `spec/feature-*.md` and ask.

## Required reading before planning

1. The spec file the user points you at (typically `spec/feature-N-*.md`).
2. `CLAUDE.md`, `STANDARDS.md`, `AGENTS.md` at repo root.
3. The most recent similar feature's files for pattern matching:
   - `src/server/db/queries/<recent>.ts` for query layer patterns
   - `src/__tests__/<recent>.test.ts` for test patterns
   - `src/app/api/<recent>/route.ts` for route patterns
   - `src/components/<recent>/*.tsx` for UI patterns
4. The `spec/couple-budget-overview.md` if the feature is part of that family — gives cross-feature context.

## Required output sections

Every plan you produce has these sections, in this order:

1. **Migration NNN** — full SQL ready to drop into `src/server/db/migrations/NNN_<name>.sql`. Use the next sequential number. Note: simple `ALTER TABLE ADD COLUMN` works for nullable or default-valued columns; the table-recreate pattern is needed only for NOT NULL FK additions.
2. **Type changes** — exact additions to `src/lib/types.ts`. Include union types, interface extensions.
3. **Query layer** — function signatures and one-line behavior for each new/modified function in `src/server/db/queries/<file>.ts`. Workspace ID is the first param.
4. **API routes** — file paths, method, body shape, validation rules, error responses.
5. **UI changes** — file list, component composition, key UX decisions (popovers, dialogs, optimistic updates). Note which files are `"use client"`. Emit `requiresUiDesign: true|false` so feature-pipeline knows whether to run the design phase.
6. **i18n keys** — table of new keys with English + Hebrew strings, under the right namespace.
7. **Test plan** — file names and a one-line summary of what each test file covers. This becomes the contract for the feature-tester skill.
8. **Open questions** — explicit list of decisions the orchestrator needs to make before implementation runs (e.g. "feature flag A or B?", "ratioed defaults to disabled or coming-soon?"). Surface these clearly — they're the highest-value part of the plan.

## Conventions you must respect

- No em dashes (`--` or `—`) anywhere in code, comments, strings, or your plan output.
- Workspace ID is always the first param on query functions.
- `import "server-only"` at the top of every file in `src/server/`.
- Type-only imports use `type` keyword.
- All imports use `@/` alias (relative paths only inside `src/server/db/`).
- File names are kebab-case.
- No `any` without a justification comment.
- shadcn/ui v4: no `asChild` prop — use `render` or style the primitive directly. Select `onValueChange` returns `string | null`.

## SQLite migration gotchas to flag

- Adding a NOT NULL FK column requires the table-recreate pattern (CREATE new, INSERT, DROP, RENAME). Note this in the plan if applicable.
- `COLLATE NOCASE` goes in the column definition in the migration, not in queries.
- CHECK constraints with enum-like text columns are fine and self-documenting.

## Spec-deviation discipline

When the spec references things that don't exist (e.g. category names not in the seed data, columns that the schema doesn't have, conditions that can't fire due to NOT NULL constraints), call them out explicitly under "Open questions" — do NOT silently work around them. Examples seen in this codebase:
- spec lists "Fuel, Rent, Dining & Restaurants" — actual seeded names are different
- spec describes a trigger requiring `sharing_type IS NULL` — column is NOT NULL with default

## Style of the plan itself

- Markdown, under 1000 words for a typical feature.
- SQL snippets in code blocks.
- Function signatures in TypeScript code blocks.
- No fluff, no restating the spec verbatim. Focus on decisions: file paths, signatures, exact SQL.

## Output protocol

Write the plan to `.claude/pipeline/plan.md` (overwriting if it exists). Final message under 200 words: path of the plan, count of files it touches, list of open questions for orchestrator decision.

## Hard rules

1. **No production code, no tests.** Read-only on `src/`.
2. **Do not make implementation decisions on behalf of the user** — surface them as open questions.
3. **Do not modify the spec file** — flag deviations under "Open questions" instead.
