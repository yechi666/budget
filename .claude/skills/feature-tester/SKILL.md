---
name: feature-tester
description: Writes failing Vitest tests for a Spent feature against a locked plan, BEFORE any production code exists. Tests act as the contract for the feature-dev skill. Trigger when the user says "write tests for this feature", "TDD this spec", "scaffold tests from the plan", or invokes `/feature-tester`. WRITES ONLY test files under src/__tests__/ — never production code.
---

# Feature tester

Write Vitest tests for a single feature in the **Spent** codebase, BEFORE any production code exists. The tests become the locked contract — they MUST NOT be changed later by the implementation step.

## Invocation

```
/feature-tester [plan-path]
```

Default plan path is `.claude/pipeline/plan.md`. If absent, ask the user.

## Hard rules

1. **You write ONLY test files** in `src/__tests__/`. You do NOT write or modify any production code under `src/server/`, `src/app/`, `src/components/`, `src/lib/`.
2. **You do NOT modify any migration file**. Implementation owns those.
3. **You do NOT modify the plan**. If something seems wrong, note it in your output and stop — let the orchestrator decide.
4. **Tests must FAIL** when you finish, with errors like `Cannot find package` or `column does not exist` or `expected undefined to be …`. If a new test passes already, it's probably not testing what you think.
5. **Existing tests must still PASS**. Run `npx vitest --run` after writing and confirm only your new tests fail.

## Required reading before writing

1. The plan markdown (the locked contract from feature-planner).
2. `STANDARDS.md` and `CLAUDE.md`.
3. `src/__tests__/helpers/db.ts` — the in-memory DB pattern (`setupTestDb()`, `teardownTestDb()`).
4. The two most recent similar test files. Glob `src/__tests__/*.test.ts` and pick.
5. The query/route files being extended (so you know what types and signatures the contract is for).

## Fixture gotchas in this codebase

These have bitten implementers before — bake them into your fixtures from the start:

- **`sync_runs` requires `workspace_id`.** Don't omit it. Pass it explicitly.
- **`bank_credentials` requires `workspace_id`.** Same.
- **Categories with names "Groceries", "Restaurants", "Bills & Utilities", "Subscriptions", "Home"** are already seeded in workspace 1 by migration 022. If your test inserts a category with one of these names into workspace 1, you'll hit `UNIQUE(workspace_id, name)`. Use unique names like `TestShared`, `TestPersonal`, `GroceriesTest` instead.
- **The seeded parent categories** are: `Food`, `Transportation`, `Lifestyle`, `Home & Bills`, `Health & Family`, `Money Movement`. Avoid these names too.
- **Expenses are stored as NEGATIVE numbers** in `charged_amount`. If your fixture inserts an "expense of 100", use `chargedAmount: -100`.

## Test file conventions

- One feature → multiple focused test files. Don't dump everything into one giant file. Example pattern: `<feature>-queries.test.ts`, `api-<feature>.test.ts`, `<feature>-monthly.test.ts` for distinct concerns.
- File names: kebab-case.
- `describe` / `it` strings: no em dashes (`--` or `—`). Use `:` or `;` as separators instead.
- Type fixtures with `interface Props { ... }`, not `type`. Inline in the file.
- Type-only imports use `type` keyword.
- No `any` without a justification comment.

## API route handler tests

Direct invocation pattern (no HTTP server needed):

```ts
import { GET, POST } from "@/app/api/<feature>/route";

const response = await GET(
  new Request("http://localhost/api/<feature>?x=1", {
    headers: { "x-workspace-id": "1" }
  })
);
expect(response.status).toBe(200);
```

For dynamic segments: pass `{ params: Promise.resolve({ id: "1" }) }` as the second arg.

## Output format

When done, produce a summary message:

- **Branch confirmation:** ran `git branch --show-current`, on `<branch>`.
- **Files created:** list each test file with test count.
- **Vitest result:** "X existing tests pass, Y new tests fail with [error pattern]". Confirm the failure mode matches expected ("missing column", "module not found", etc.).
- **Any spec/plan concerns:** if you noticed the plan was missing something, mention it but did NOT change it.
- Total under 200 words.

## You do not

- Write or modify production code
- Modify migrations
- Run dev / fix / commit production changes
- Modify existing test files (write new ones)
- Switch git branches (the orchestrator manages branches)
