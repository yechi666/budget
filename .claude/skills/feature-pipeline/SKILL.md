---
name: feature-pipeline
description: Orchestrate a complete feature end-to-end (plan → tests → dev → code-review → PR) in this Spent codebase. Two modes - "auto" runs without stopping, "supervised" pauses at gates for user review. Supports partial supervision (only some gates active) and resumable state. Trigger when the user says "build feature X", "implement spec/...", "run the feature pipeline", "ship this spec", or invokes `/feature-pipeline`.
---

# Feature Pipeline

A repeatable workflow for taking a spec from `spec/feature-N-*.md` to an open PR.

## Invocation

```
/feature-pipeline <mode> [spec-path] [gates=...]
```

- `mode`: `auto` | `supervised` (default `supervised`)
- `spec-path`: e.g. `spec/feature-6-income-ratio.md` (prompt the user if missing)
- `gates`: comma-separated subset of `plan,review,design-wireframe,design-uiplan,tests,dev,code-review,pr`. Default in supervised mode is all eight (when design phase applies). `design-wireframe` is mandatory in BOTH modes when Phase 2.5 runs — it cannot be removed from the gates list.

**Resume:** `/feature-pipeline continue` reads `.claude/pipeline-state.json` and picks up at the next phase.

## State file

After each completed phase, write `.claude/pipeline-state.json`:

```json
{
  "spec_path": "spec/feature-6-income-ratio.md",
  "mode": "supervised",
  "gates": ["plan", "tests", "code-review"],
  "branch": "feat/income-ratio",
  "parent_branch": "main",
  "phase": "tests-complete",
  "next_phase": "dev",
  "artifacts": {
    "plan": ".claude/pipeline/plan.md",
    "tests_commit": "abc1234",
    "dev_commit": null,
    "pr_url": null
  },
  "decisions": {
    "open_q_partition_strategy": "by month"
  },
  "blocked_reason": null
}
```

Phases in order: `setup` → `planning` → `plan-reviewed` → `design-wireframed` → `design-uiplanned` → `tests-written` → `dev-complete` → `code-reviewed` → `pr-opened` → `done`.

`design-wireframed` and `design-uiplanned` are skipped (and the state advances past them) when the planner emits `requiresUiDesign: false`.

## Phase 0: Setup

1. Verify git is clean. If not, stop and ask (do NOT auto-stash).
2. Read the spec file.
3. Extract `Depends on:` lines. Determine parent branch (the most-downstream branch that already contains those features). If unclear, ask.
4. Derive a kebab-cased branch name from the spec title (e.g. "Feature 6 -- Income Ratio" → `feat/income-ratio`).
5. `git checkout -b <branch> <parent>`.
6. Write the state file. Set `phase: setup-complete`, `next_phase: planning`.

## Phase 1: Plan

Dispatch a `general-purpose` sub-agent and instruct it to invoke the `feature-planner` skill against the spec. The skill body defines its own brief; the dispatch prompt only needs the spec path, the parent branch name, and any user-supplied context. Required output sections (enforced by the skill):
- Migration SQL (full text, ready to drop into a file) if any
- Type changes (exact additions to `src/lib/types.ts`)
- Query layer function signatures
- API routes with validation rules
- UI changes (file paths, behavior, popovers/dialogs)
- i18n keys with English + Hebrew
- Test plan (file names + what each tests)
- Open questions for orchestrator decision

Save to `.claude/pipeline/plan.md`.

**Gate `plan`** (supervised mode + `plan` in gates):
- Show plan + the open questions extracted from it.
- AskUserQuestion (chips): `approve` / `revise with notes` / `regenerate` / `skip plan-review`.
- If `revise`: collect notes, prepend to a re-dispatch.
- If `regenerate`: redispatch unchanged.
- If `skip plan-review`: jump to Phase 3.

## Phase 2: Plan review

Dispatch a `general-purpose` sub-agent with a tight brief: compare the plan against the spec + standards + the actual codebase (existing patterns, naming, file layouts). Output a punch list. There is no dedicated skill for this — the brief is short enough to inline.

**Gate `review`** (supervised mode + `review` in gates):
- Show punch list.
- AskUserQuestion: `accept all` / `accept some` / `override reviewer` / `revise plan`.
- If `accept some`: present each finding with `absorb` / `skip` chips.
- Apply accepted findings to a revised plan, save as `plan.md` (overwrite).

In auto mode: orchestrator applies obvious findings (correctness bugs in the plan, real spec gaps) and skips style-only nits.

## Phase 2.5: Design (conditional)

**Runs only when the planner's output indicates UI changes are needed.** The planner emits a `requiresUiDesign: boolean` field in its open-questions / decisions section based on whether the spec has substantive UI work (new pages, new components, new interactions). Server-only features (e.g. an API-only feature, a query layer addition) skip this phase entirely.

This phase has two sub-steps with a mandatory user-approval gate between them — even in auto mode. Wireframe mistakes cascade expensively into tests and implementation, so the gate is non-negotiable.

### Phase 2.5a: Wireframe

Dispatch a `general-purpose` sub-agent and instruct it to invoke the `wireframer` skill. Pass:
- The spec path
- The locked plan path (`.claude/pipeline/plan.md`)
- Reading list of 2-3 analogous existing pages for visual reference

The skill writes to `.claude/pipeline/wireframe.md`: box-drawing wireframes per screen, layout structure, component placement, interaction notes, RTL/responsive callouts. No specific shadcn primitives, no copy, no CSS.

### Gate `design-wireframe` (always fires, even in auto)

- Show: the wireframe file contents.
- AskUserQuestion (chips): `approve and run /ui-planner` / `revise with notes` / `regenerate` / `skip ui-planner (use wireframe as-is)`.
- **Why mandatory even in auto:** UI taste is hard to delegate; wrong layout decisions cost 2-3x more tokens to unwind later than to catch here.
- If `revise`: collect notes, redispatch wireframer.
- If `skip ui-planner`: jump to Phase 3 with only the wireframe as the design artifact (faster but less detail for tester/dev).

### Phase 2.5b: UI Plan

After wireframe is approved, dispatch a `general-purpose` sub-agent and instruct it to invoke the `ui-planner` skill. Pass:
- The approved wireframe at `.claude/pipeline/wireframe.md`
- The locked plan path
- The spec for context

The skill writes to `.claude/pipeline/ui-plan.md`: detailed component tree, specific shadcn/base-ui primitives, file paths, state management, mutation invalidation rules, i18n key candidates, accessibility notes, responsive/RTL specifics.

### Gate `design-uiplan` (supervised + `design-uiplan` in gates)

- Show: the UI plan content + counts (new components, i18n keys, routes).
- AskUserQuestion: `approve` / `revise with notes` / `regenerate`.
- In auto mode: auto-approve unless the skill surfaced "issues with wireframe" in its output (then escalate as a blocker per the orchestrator's auto-mode rules).

The UI plan feeds into Phase 3 (feature-tester's contract) and Phase 4 (feature-dev's brief).

## Phase 3: Tests

Dispatch a `general-purpose` sub-agent and instruct it to invoke the `feature-tester` skill. The skill body defines its own brief; the dispatch only passes:
- Path to the locked plan (`.claude/pipeline/plan.md`)
- Path to `ui-plan.md` if Phase 2.5 ran
- Branch name (for the agent to confirm via `git branch --show-current`)

After completion:
- Run `npx vitest --run`. Confirm: prior tests still pass; new tests fail with module-missing / column-missing errors.
- Commit: `test: add failing tests for <feature-name>`.

**Gate `tests`** (supervised + `tests` in gates):
- Show: file list + test count per file + brief "what each file tests" summary.
- AskUserQuestion: `approve` / `view <file>` / `revise <notes>` / `regenerate`.
- `view <file>` reads the test file and shows it, then re-asks.

## Phase 4: Dev

Dispatch a `general-purpose` sub-agent and instruct it to invoke the `feature-dev` skill. The skill body owns all the standards, branch discipline, stop-and-report rules, and the "when done" checks. The dispatch prompt only passes:

- Path to the locked plan
- Path to `ui-plan.md` if Phase 2.5 ran
- The expected branch name (the skill checks `git branch --show-current` against this)
- A reminder that any drift from the locked plan or any need to modify a test triggers STOP-and-report rather than a workaround.

After completion: verify branch (orchestrator-level check, do NOT trust the agent's report), run vitest + tsc + lint, capture stats. Commit: `feat: <description>`.

**Gate `dev`** (supervised + `dev` in gates):
- Show: `git status --short`, `git diff --stat`, test pass count, tsc result, lint delta (vs pre-dev count).
- AskUserQuestion: `approve` / `view <file>` / `revise with notes` / `re-dispatch dev`.

## Phase 5: Code review

Dispatch a `general-purpose` sub-agent and instruct it to invoke the `feature-reviewer` skill. Scope: `git diff <parent>..<branch> -- src/` (exclude tests).

Filter findings as orchestrator:
- Real correctness bugs → fix
- Real unmet spec acceptance criteria → fix
- Spec misreads (reviewer flagging something the spec doesn't require, or a documented intentional deviation) → reject
- Style nits → fix only if cheap; otherwise comment on PR

**Gate `code-review`** (supervised + `code-review` in gates):
- Show punch list grouped by severity.
- AskUserQuestion: `fix all valid` / `fix some` / `view <file>` / `ignore all`.
- `fix some`: per-finding chips.

Apply fixes directly (orchestrator edits, not via another agent). Re-run vitest. Commit: `fix: address code review findings on <feature>`.

## Phase 6: PR

1. Write PR body to `.pr-body-<branch>.md`. Always use `--body-file`, never `--body` (the permission hook blocks long inline strings).
2. PR title in conventional commit format: `feat: <description>`.
3. `gh pr create --base <parent_branch> --head <branch> --title "<title>" --body-file <path>`.
4. `rm <path>`.
5. Append a summary section to `work.md` with link, test counts, deviations.

**Gate `pr`** (supervised + `pr` in gates):
- Show title + body + base/head.
- AskUserQuestion: `open` / `edit title` / `edit body` / `change base`.

## Auto mode

Skip all gates. Pause only on genuine blockers (write `blocked_reason` to state file and ask the user):
- Plan agent finds the spec is internally contradictory
- Test agent finds a fixture conflict with seed data that needs a name choice
- Dev agent invokes the "STOP and report" rule
- Permission hook blocks a command
- A spec deviation needs an orchestrator decision (category name doesn't exist, etc.)

In auto mode, the user is NOT in the loop unless explicitly blocked. Trust the locked plan + tests + code review to catch issues.

## Anti-patterns (apply in BOTH modes)

1. **Never let a sub-agent modify a test file.** If the dev agent suggests test changes, you decide as orchestrator and edit yourself. Sub-agents are forbidden from `src/__tests__/`.
2. **Never let a sub-agent modify production schema to satisfy a test fixture.** The fix goes in the test fixture, not the migration.
3. **Always verify branch before AND after dispatching a dev or test agent.** Sub-agents have been observed to silently switch branches; their work then ends up on the wrong branch and gets lost when their host branch gets reset.
4. **Always use `gh pr create --body-file`**, never `--body`. The user's permission hook rejects long `--body` strings.
5. **Don't dispatch a code-review agent on tests.** Tests are the locked contract; review only `src/` non-test changes.
6. **When a reviewer flags something, decide if they're right.** Reviewers can mis-read the spec (e.g. flagging an intentionally-dropped trigger as a blocker). Don't blindly apply findings.

## Workflow skills

Every phase dispatches a `general-purpose` sub-agent and tells it to invoke the matching workflow skill. Skills live in `.claude/skills/` and own their own briefs — your dispatch prompt stays short.

- **`feature-planner`** — Phase 1. Outputs the structured plan. Must include `requiresUiDesign: boolean` in its decisions section.
- **`wireframer`** — Phase 2.5a. Produces low-fidelity wireframes when UI work is needed.
- **`ui-planner`** — Phase 2.5b. Produces the detailed UI implementation plan after wireframe is approved.
- **`feature-tester`** — Phase 3. Writes failing tests only. Reads `ui-plan.md` if Phase 2.5 ran, so tests target the planned UI structure.
- **`feature-dev`** — Phase 4. Implements against tests with branch-discipline + test-immutable rules. Reads `ui-plan.md` if present.
- **`feature-reviewer`** — Phase 5. Reviews the diff for correctness bugs and unmet ACs.

Plan-review (Phase 2) uses `general-purpose` with a tight inline brief — there's no dedicated skill for it.

Because the role briefs live in each skill body, your dispatches stay short: pass the spec path, the locked plan path, the parent branch name, and any open-question decisions. Don't restate the standards or branch rules — they're baked into the skill.

### Sub-agent dispatch template

For each workflow phase, the dispatch prompt looks like:

```
Invoke the `<skill-name>` skill from .claude/skills/. The skill defines your full brief.

Context for this run:
- Spec: <spec-path>
- Locked plan: .claude/pipeline/plan.md
- UI plan (if present): .claude/pipeline/ui-plan.md
- Branch: <branch-name>  (verify with `git branch --show-current` first)
- Open questions resolved by orchestrator: <list>

Follow the skill's output protocol verbatim.
```

## Continue (resume)

When user runs `/feature-pipeline continue`:
1. Read `.claude/pipeline-state.json`. If missing, say so and exit.
2. If `blocked_reason` is set: show it and ask how to proceed.
3. Otherwise: jump to `next_phase` and run from there. Mode and gates from the state file.

## Cleanup

After Phase 6 succeeds, set `phase: done` in the state file but keep it (useful for `gh pr view`, follow-up commits). Delete only when starting a new pipeline run for a different feature.

## Notes

- `.claude/` is gitignored, so the state file and plan artifacts are per-machine.
- Pipeline can be invoked on already-existing branches (e.g. if the user manually started the work). It'll detect the current branch, infer phase from git log, and ask before continuing.
- The plan-reviewer is the lowest-value step. Skipping it (gates without `review`) is a reasonable optimization for small features.
