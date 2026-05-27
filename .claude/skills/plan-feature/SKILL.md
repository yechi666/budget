---
name: plan-feature
description: Use this skill whenever the user finishes planning a feature and wants it broken down and documented. Trigger on phrases like "write a spec", "divide this into features", "create a spec for this", "document this plan", "split this into features", "add to the spec folder", or when a planning conversation wraps up and the user wants the plan captured as files. Also trigger when the user says something like "let's spec this out" or "turn this into a spec". The skill splits the feature into 3-7 independently shippable sub-features and writes a spec/ folder with one overview file and one file per sub-feature. Each sub-feature file includes: goal, dependencies, DB changes (with SQL), API changes, UI description, and acceptance criteria.
---

# Spec Writer

You are turning a planned feature into a structured spec folder. Your job is to break the feature into well-scoped, independently shippable sub-features and document each one clearly.

## Step 1 -- Understand what was planned

Read the conversation carefully before writing anything. Extract:

- **Core data model** -- what new tables or columns are needed?
- **API surface** -- new routes or changes to existing ones?
- **UI changes** -- new pages, new components, changes to existing UI?
- **Decisions already made** -- what did the user explicitly commit to?
- **Out of scope / future** -- what was explicitly deferred?

If the conversation is ambiguous on something important, ask before writing. Don't invent decisions the user hasn't made.

## Step 2 -- Plan the feature split

A good split produces 3-7 sub-features where:

- **Each feature is independently shippable** -- it delivers real value and can be merged on its own.
- **Dependencies are explicit and minimal** -- Feature 2 might need Feature 1's DB schema, but shouldn't need Feature 1's UI to be complete.
- **Feature 1 is always the foundation** -- DB migrations, core data model, basic API. No UI yet. Everything else builds on this.
- **Later features add UI and polish** -- the payoff comes after the foundation is solid.
- **Each feature is roughly 1-2 weeks of work** -- not a one-day task, not a month-long epic.

Signs of a bad split:
- A feature that can't run without another being fully done (hidden dependency)
- A feature so large it needs its own split
- A feature that's just a single task (e.g. "add one column")

Think through the split before writing any files.

## Step 3 -- Write the files

### File structure

```
spec/
├── <feature-name>-overview.md     # Overview of the whole feature
├── feature-1-<slug>.md
├── feature-2-<slug>.md
└── ...
```

- Create `spec/` if it doesn't exist. If it does, add to it -- don't overwrite existing files.
- Name the overview after the feature (e.g. `notifications-overview.md`).
- Name sub-feature files `feature-N-<short-slug>.md` where the slug is 2-4 words.

---

### Overview file template

```markdown
# <Feature Name> -- Overview

## Context
2-4 sentences: what this feature is, who uses it, and why it matters.

## <Core concept section -- optional>
If there's a shared model or concept all sub-features rely on (a permission model, a sharing model, a pricing model), explain it here with a table or example. Skip this if the feature is straightforward.

## Feature list

| # | Feature | Depends on |
|---|---|---|
| 1 | [Name](feature-1-slug.md) | -- |
| 2 | [Name](feature-2-slug.md) | Feature 1 |

## Decisions
- One bullet per concrete decision already made during planning.

## Future features (optional)
- Things explicitly deferred, with a one-line reason each.
```

---

### Sub-feature file template

```markdown
# Feature N -- <Name>

## Goal
1-2 sentences: what this feature delivers and why it belongs at this position in the build order.

**Depends on:** Feature X (reason) -- or "None" if it's the first.

## Database changes

Exact SQL -- CREATE TABLE and ALTER TABLE statements. Add a brief comment for non-obvious design choices (nullable columns, ON DELETE behavior, why a constraint exists).

Omit this section if the feature has no DB changes.

## API changes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/...` | ... |

Add a TypeScript interface only when the request or response shape is non-obvious. Omit this section if no API changes.

## UI: <Page or component name>

Describe what page, what the layout contains, and what actions the user can take. Enough for a developer to build without guessing, but not pixel-level design.

Omit this section if the feature has no UI.

## Acceptance criteria

- [ ] Observable, testable behaviors -- not implementation details.
- [ ] 5-10 items is typical.
- [ ] "The balance card appears on the home page" is good. "The UI looks nice" is not.
```

---

## Style rules

- **Omit empty sections.** If a feature has no DB changes, don't include that heading.
- **Write real SQL.** Actual `CREATE TABLE` and `ALTER TABLE` statements, not "add a table for X".
- **Acceptance criteria must be testable.** If you can't check it by clicking around the app or running a query, rewrite it.
- **Don't over-specify UI.** Describe what the user sees and does, not how the component is implemented.
- **No em dashes** (--) -- use -- instead. No trailing fluff. Write tightly.
