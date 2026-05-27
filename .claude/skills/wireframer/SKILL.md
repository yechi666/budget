---
name: wireframer
description: Produces low-fidelity wireframes for a UI feature in the Spent codebase BEFORE the detailed UI plan. Output is markdown with box-drawing characters and concise component labels. Trigger when the user says "wireframe this feature", "sketch the UI for spec X", "design the layout before the detailed plan", or invokes `/wireframer`. The wireframe goes to the user for approval before the `ui-planner` skill fills in the detailed plan.
---

# Wireframer

Produce a **low-fidelity wireframe** for a single UI feature in the **Spent** codebase. This is the FIRST design step. The user reviews your wireframe, and only after approval does the `ui-planner` skill produce the detailed implementation plan.

Your output is intentionally rough: visual hierarchy, layout, component placement, interaction states. NOT actual copy, NOT specific shadcn primitives, NOT CSS classes. Save those for the ui-planner.

## Invocation

```
/wireframer <spec-path>
```

Default plan path is `.claude/pipeline/plan.md` for cross-reference.

## Required reading

1. The spec file (typically `spec/feature-N-*.md`). Focus on the **UI changes** section.
2. `spec/current-app.md` if present — high-level UI conventions.
3. **Two existing pages in the same family** for visual context. Read at least:
   - `src/components/home/home-page.tsx` (multi-card layout pattern)
   - `src/components/dashboard/transactions-table.tsx` (table + filter pattern)
   - Or the most analogous existing component to what you're designing.
4. `STANDARDS.md` (may live in repo root or `docs/dev/STANDARDS.md` — use Glob to find it).

## What a wireframe contains

For each new or modified screen/page:

1. **Header line** with route + page title:
   ```
   ── /balance ──────────────────────────────────────────
   ```

2. **Section blocks** as boxes:
   ```
   ┌─────────────────────────────────────────────────┐
   │ Running balance summary                         │
   │   "Reni is owed 1,240 ₪"  [Log settlement btn] │
   └─────────────────────────────────────────────────┘
   ```

3. **Table-like sections** with column headers:
   ```
   ┌─ Monthly breakdown ─────────────────────────────┐
   │ Month  | Shared | A paid | B paid | A's share  │
   │ Apr 25 |   930  |   400  |   530  |    465     │
   └─────────────────────────────────────────────────┘
   ```

4. **Modal / popover boxes** rendered separately with a note:
   ```
   ┌─ Settlement dialog (opens on "Log settlement") ─┐
   │ Amount  [______]                                │
   │ Date    [today  v]                              │
   │ Who paid? ( ) A → B  (•) B → A                  │
   │                              [Cancel] [Submit]  │
   └─────────────────────────────────────────────────┘
   ```

5. **Interaction notes** at the bottom of each screen as a short list:
   ```
   Interactions:
   - "Details" link → /balance
   - Hover on monthly row → highlight A/B columns
   - Empty state ("You're even") replaces the running-total line
   ```

6. **Responsive notes** when relevant:
   ```
   Mobile (md-): collapse monthly table to per-month cards
   ```

## What you do NOT include

- Specific shadcn primitives (no "Use Popover, PopoverTrigger…"). Save for ui-planner.
- Tailwind classes / CSS.
- i18n keys / actual copy. Use placeholder English; ui-planner finalizes.
- Component-tree pseudocode.
- Test plans.
- File paths for new components.
- Detailed accessibility specs.

## File naming and location

Save to `.claude/pipeline/wireframe.md` (under the pipeline working directory). The feature-pipeline skill reads from here when invoking the ui-planner skill later.

Use a single file with `## Screen: <name>` headers for each screen. Order screens by user flow, not file structure.

## Israeli context

- Currency: ₪
- RTL: note when a layout needs flipping. Use `[RTL]` tag inline.
- Hebrew copy: don't write Hebrew in the wireframe; placeholder English with a note "Hebrew label TBD".

## Conventions for the wireframe text itself

- **No em dashes** (`--` or `—`). Use `:` or `;` as separators.
- Markdown headers for top-level structure.
- Code fences (` ``` `) wrap each box-drawing diagram.
- Box-drawing chars: `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼`. Use ASCII fallback (`+`, `-`, `|`) if box-drawing breaks rendering.

## Hard rules

1. **One wireframe file only.** Don't touch other specs or code.
2. **No production code.** Read-only on `src/`.
3. **No decisions on user's behalf.** If the spec is ambiguous on UI (e.g. "shows a chip" but unclear placement), propose ONE option and add an "open question" note at the bottom of the screen.

## Output protocol

When done:
1. Path of the wireframe file.
2. One-paragraph summary of screens covered.
3. List of open questions for user review (especially: anywhere you had to choose between two reasonable layouts).
4. Recommendation: "approve to proceed to ui-planner" or "needs spec clarification first".
5. Under 200 words.

The orchestrator (or user) reviews. After approval, the `ui-planner` skill runs with this file as input.
