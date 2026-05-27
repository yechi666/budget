---
name: feature-dev
description: Implements a Spent feature against pre-existing failing tests. Tests are the locked contract — you may not modify them. Trigger when the user says "implement this feature", "make the tests pass", "write the production code for the plan", or invokes `/feature-dev`. Includes branch-discipline, anti-scope-creep, and stop-and-report rules for problematic tests.
---

# Feature dev

Implement the production code that makes a set of pre-existing failing Vitest tests pass in the **Spent** codebase. The tests are your locked contract.

## Invocation

```
/feature-dev [plan-path]
```

Default plan path is `.claude/pipeline/plan.md`. Failing tests live in `src/__tests__/`.

## Hard rules — read these first

1. **`git branch --show-current` is the first command you run AND the last command you run.** If at start it's not the expected branch, `git checkout <expected-branch>` immediately. If at end it's wrong, your work is on the wrong branch and lost; report it.

2. **You may NOT modify any file in `src/__tests__/`.** Period. Not to fix a typo, not to add a missing assertion, not to "improve" a fixture. If a test seems wrong, STOP and report — do not work around it by modifying production code (e.g. don't change a migration's schema to satisfy a test that omits a required column).

3. **You may NOT add scope.** No "while I'm here" refactors. No new migrations beyond what the plan calls for. No new dependencies. If the plan didn't list it, don't build it.

4. **You may NOT switch branches.** Stay on the branch the orchestrator put you on.

5. **You may NOT change production schema to satisfy a weak test fixture.** Example: if a test inserts into `sync_runs` without `workspace_id` and the insert fails, the fix is to fix the test fixture, NOT to give `sync_runs.workspace_id` a default. Report it instead.

## Required reading

1. The plan markdown (the locked contract).
2. The failing test files in `src/__tests__/` — these are your contract.
3. `CLAUDE.md`, `STANDARDS.md`, `AGENTS.md`.
4. The adjacent files you're extending — read them in full before editing.
5. If extending an existing query/route file, read it end-to-end. Don't pattern-match from a snippet.

## Standards (non-negotiable)

- No em dashes (`--` or `—`) anywhere in code, comments, strings, or commits.
- Workspace ID is always the first param on query functions.
- `import "server-only"` at the top of every file in `src/server/`.
- Type-only imports use `type` keyword.
- All imports use `@/` alias (relative paths only inside `src/server/db/`).
- File names are kebab-case.
- No `any` without a justification comment.
- shadcn/ui v4: no `asChild` — use `render` or style the primitive directly. Select `onValueChange` returns `string | null`.
- One component per file. Named exports, no default.
- `"use client"` only when you actually need state/effects/event handlers/browser APIs.

## SQLite migrations

- Sequential numbering. Next number = highest existing + 1.
- Plain `ALTER TABLE ADD COLUMN` works for nullable columns and columns with literal defaults.
- The table-recreate pattern (CREATE new, INSERT INTO, DROP old, RENAME) is needed ONLY for NOT NULL FK additions. Don't reach for it casually.
- Never modify an existing migration file. Add a new one.
- `COLLATE NOCASE` goes in the column definition.

## Stop-and-report triggers

STOP and report — do NOT work around — if you encounter any of:

- A test that fails because of a fixture conflict with seed data (e.g. inserting a category named "Groceries" into workspace 1).
- A test that expects a field not in the plan.
- A test that requires modifying a migration that already shipped.
- A test that requires schema changes outside the plan.
- A test that contradicts another test.
- Sub-agent confusion: if you can't tell which branch you're on, what tests are the contract, or what the plan is — stop.

When you stop, your report says:
1. What test file + line.
2. What the test expects.
3. Why you believe the test is wrong (or you can't satisfy it without violating a rule).
4. What you'd need from the orchestrator to proceed.

## When done

Run these checks in order:

1. `git branch --show-current` confirms expected branch.
2. `npx vitest --run` — ALL tests pass (existing + new).
3. `npx tsc --noEmit` — clean.
4. `npm run lint` — no new errors (pre-existing errors in `src/components/setup/*` are known and OK).

If any check fails, fix it without violating rules above. If you can't, stop and report.

## Output format

Under 250 words:
- Branch confirmed.
- Files created/modified (counts).
- Test pass count.
- TypeScript: clean / errors.
- Lint: delta vs pre-feature count.
- Any blocked/stop-and-report situations.

## You do not

- Modify tests
- Switch branches
- Add unrelated migrations or refactors
- Commit (the orchestrator commits)
- Open PRs
