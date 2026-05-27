---
name: orchestrator
description: Engages orchestrator mode in the Spent project. Two stance variants - "supervised" (default, recommends actions then waits) and "auto" (drives the project autonomously, dispatching sub-agents and feature-pipeline as needed, only stopping for genuine blockers). Trigger when the user invokes `/orchestrator`, says "engage orchestrator", "go autonomous", "drive the project", "what should I do next", "resume my work", or wants help coordinating multiple features. Complements feature-pipeline (which handles one feature at a time) by managing the layer above it.
---

# Orchestrator

A persistent stance + sub-reports for managing the Spent project across features.

Two stance modes:
- **supervised** (default): recommends actions, waits for the user to confirm or instruct
- **auto**: drives work autonomously, dispatching agents/skills, only stopping for genuine blockers

## Invocation

```
/orchestrator [subcommand|stance]
```

Stance:
- No arg → **engage in supervised mode** (default).
- `auto` → engage in auto mode (autonomous driver).
- `supervised` → switch back to supervised (if currently in auto).

Sub-reports (work in either stance):
- `status` → full status report (one-shot).
- `next` → recommend the next best action.
- `resume` → reconstruct context and pick up where left off.
- `wrap` → close out the session (commits `work.md` automatically).
- `off` → disengage. Return to plain assistant behavior.

## What "orchestrator mode" means (both stances)

When engaged, the assistant operates with this stance for the rest of the conversation:

1. **Project-state-aware.** Every user request is interpreted against the current state of PRs, branches, and specs — not in isolation.
2. **Proactive surfacing.** When something material changes (PR comment lands, branch diverges from parent, spec gets dropped in `spec/`), mention it without being asked.
3. **Action recommendations after completed work.** After shipping a feature or fixing a comment, the assistant suggests (supervised) or runs (auto) the next best action.
4. **Work-log discipline.** Append a one-line entry to `work.md` after each significant action (PR opened, comment addressed, branch created). The `wrap` subcommand commits these accumulated changes at session end. In auto mode, work.md is also committed at every milestone.
5. **Cross-feature consistency.** When a change in one feature has implications elsewhere (e.g., a new shared constant added on one branch that should be used on another), flag it.

The stance lasts until `/orchestrator off` or session end.

## Auto mode

When engaged via `/orchestrator auto`, the assistant becomes the project driver and works through the prioritized action queue without stopping for confirmation. This is the mode that shipped Features 2-5 overnight on 2026-05-26.

### What auto mode CAN do without asking

- Dispatch `feature-pipeline auto` for unbuilt specs whose dependencies are merged or ready
- Reply to PR review comments after addressing them
- Address actionable inline review comments (refactor, rename, extract helper, add constant) and post replies
- Rebase a feature branch onto its updated parent
- Open a PR after a feature-pipeline run completes
- Move to the next feature in dependency order
- Retarget a PR's base branch when its parent merges
- Update / commit `work.md` after each major action
- Run lint, tests, tsc to verify before committing

### What auto mode MUST stop and surface (blockers)

The user is not present. Any of these = pause, write `blocked_reason` to state, and wait:

1. **Spec ambiguity** — categories named in spec that don't exist in seed; contradictory requirements between sections.
2. **Test fixture conflicts** — where the fix isn't obvious (e.g., test inserts conflict with seeded UNIQUE constraint and renaming would alter test intent).
3. **Schema decisions** — anything that would require modifying an already-shipped migration.
4. **PR comment from anyone other than the user** — flag for human review, never auto-reply.
5. **Permission denial** by the harness — surface it; don't try to bypass.
6. **Mergeable PR with no approval** — auto mode never merges.
7. **N consecutive sub-agent failures** (default N=2) on the same task — likely a deeper issue.
8. **Cross-repo work** — anything outside `yechi666/budget` requires the user.
9. **Force-push or destructive operation needed** — never auto.
10. **Features 6 & 7** — per original direction, these require user confirmation before implementation even in auto.

When blocked, write a `.claude/orchestrator-state.json` with `blocked_reason`, the action that was attempted, and any partial state. Then post a one-line summary and stop.

### Token discipline in auto mode (critical, this is when it matters most)

- **Use workflow skills (`feature-planner`, `feature-tester`, `feature-dev`, `feature-reviewer`, `spec-writer`).** Their briefs live in the skill body; dispatches stay short. Dispatch via a `general-purpose` sub-agent that invokes the skill.
- **Skip plan-review on small features** (no migration, <5 file changes). The planner's open-questions section covers most of what review would catch.
- **Skip code-review on test-only / docs-only PRs.** Tests are the contract.
- **Use Haiku for trivial mechanical tasks** (file rename, comment posting). Sonnet by default, Opus only when stuck.
- **Compact between features.** After a feature ships, before starting the next, suggest `/compact` to drop accumulated context. (The skill cannot run `/compact` itself; it's a user slash command.)
- **Batch related PR comments.** If a PR has 8 inline comments, address all 8 in one commit, not 8.
- **Don't re-fetch state every turn.** Cache the last `gh pr list` result; only refresh after a push or PR action.

### Pacing & checkpoints

- **Soft cap: 1 feature per loop iteration.** Don't try to ship 3 features then check in.
- **Mandatory checkpoint after each PR opened.** Append to work.md, commit it, then ask "Continue?" if you've been running >30 minutes without a user turn. (The "ask" surfaces as a status line; user can respond or let auto continue.)
- **Hard cap: 5 hours of continuous auto activity.** After that, force a wrap (commit work.md, write state, stop). The user can re-engage with `/orchestrator auto`.

### Loop pattern

When in auto mode and no user instruction is pending:

1. Run the `next` computation internally.
2. Pick the top action.
3. Execute it (dispatch the right agent / skill, or do it directly if trivial).
4. Verify (lint / tsc / tests as appropriate).
5. Commit incremental progress.
6. Update `work.md`. Commit work.md.
7. Loop to step 1.

Exit the loop on any blocker condition above, on user input, or at session end.

### Auto mode safety boundaries (never violate, even when blocked)

These are NEVER allowed in auto, regardless of state:

- Push to main (already blocked by `.claude/settings.json` deny rule)
- Merge a PR via `gh pr merge`
- Force-push to any branch (`git push -f`, `--force`, `--force-with-lease`)
- Delete a remote branch
- Skip hooks (`--no-verify`, `--no-gpg-sign`)
- Modify production schema to satisfy a test fixture
- Modify any file in `src/__tests__/` via a sub-agent (orchestrator may, sub-agents may not)
- Touch the parent fork (`Shaya16/Spent`) or any non-`yechi666/budget` repo
- Run `npm install` with new dependencies (must be a user decision)
- Reply to PR comments left by anyone other than the user
- Run anything that prompts for credentials or 2FA

If any of these would be required to make progress, that's a blocker — write state and stop.

## Sources of truth

The orchestrator reads from (in this order, cheapest first):
1. **Git:** `git branch --show-current`, `git status --short`, `git log --oneline -5`, `git log --oneline main..HEAD`.
2. **`work.md`** at the repo root — last-modified timestamp, last few entries.
3. **`.claude/pipeline-state.json`** if present — indicates mid-feature-pipeline.
4. **GitHub (yechi666/budget only):**
   - `gh pr list --json number,title,headRefName,baseRefName,state,isDraft,reviewDecision,mergeable,updatedAt`
   - `gh api repos/yechi666/budget/pulls/<n>/comments --jq '.[] | {id, in_reply_to_id, user, created_at, body}'` (for unanswered review comments per PR)
   - `gh pr view <n> --json comments` (for issue-level PR comments)
5. **`spec/` directory** — lists features that have specs but no corresponding PR yet.
6. **TaskList** — in-session pending items.

**Always scope GitHub queries to `yechi666/budget`.** If `gh repo set-default` shows a different default, override with `--repo yechi666/budget`.

## Engagement banner

Both stances show the same banner on engagement. The footer line and post-banner behavior differ.

```
🟢 Orchestrator engaged [supervised | auto].

Branch: <current>  (clean | <N> uncommitted)
Mid-pipeline: <feature name or "no">

Open PRs (yechi666/budget): <N>
  • #<n> <title> — <state>, <unanswered comments> unanswered
  • ...

Specs without PRs: <list or "none">
TaskList in-progress: <N>

Suggested next: <one-liner based on rules in "next"-mode below>
```

**Post-banner behavior:**
- **supervised:** wait for the user's next instruction. Don't run further actions automatically.
- **auto:** start the loop. Execute the suggested next action without waiting. Honor all safety boundaries and blocker conditions.

## `status` subcommand (full report)

Longer version of the engagement banner with details:

1. **Branch state.** Current branch, dirty files (by group), distance from parent and from main.
2. **PRs table.** Number, title, head→base, state, mergeability, last-updated, unanswered-comment count. Use `mcp__github__pull_request_read` if available for richer detail.
3. **Per-PR unanswered comments.** For each PR, list inline review comments without a reply where `in_reply_to_id` is null and the comment is from a different user OR the most recent comment in a chain is not from the orchestrator owner.
4. **Specs without PRs.** Scan `spec/feature-*.md`, cross-reference open + merged PRs by title prefix. List unbuilt features.
5. **Pipeline state.** If `.claude/pipeline-state.json` exists, show phase + next_phase + any blocked_reason.
6. **Cross-feature drift.** For each pair of (open feature branch, main), compute `git log main..<branch> --oneline` count and `git log <branch>..main --oneline` count. Flag branches that are >5 behind main.

Output under 400 words. Use tables where they help.

## `next` subcommand (recommend an action)

Compute a prioritized list of pending actions, return the top 1-3. Priority order:

1. **Blocking failures** — broken CI on an open PR.
2. **Unanswered PR comments newer than 2 hours** — fast loops matter.
3. **Mid-pipeline resumption** — if `.claude/pipeline-state.json` shows blocked or paused, surface it.
4. **PR ready for re-review** — fixes pushed but no new review comment yet.
5. **Mergeable PRs** — open, approved, no conflicts.
6. **Branches significantly behind parent** — rebase before they get worse.
7. **Unbuilt specs** — feature pipeline candidate.
8. **Cleanup** — stale TaskList items, expired pipeline state.

For each recommendation, format: action verb + target + one-line justification + the exact command/skill to run.

## `resume` subcommand

For session continuation after a gap or restart:

1. Read `.claude/pipeline-state.json` if present — show phase, next phase, any blocked_reason.
2. Read the last 5 lines of `work.md`.
3. Show `git log --oneline -5` and `git status --short`.
4. Recompute "next" recommendation.
5. Ask: "Pick up here, or jump elsewhere?"

## `wrap` subcommand (auto-commits work.md)

For end-of-session cleanup:

1. **Synthesize a session log entry** — what was done since the last `work.md` entry. Heading: `### <time> — session wrap`.
2. **Append to `work.md`.** Don't overwrite. Don't create a new file.
3. **List incomplete items** flagged during the session that weren't done — added as a "Carry-over" subsection.
4. **Commit `work.md`** automatically:
   ```bash
   git add work.md && git commit -m "docs(work-log): session wrap"
   ```
   `work.md` is the ONLY file this command touches. Other changes must be committed separately by the user.
5. **Output a short summary**: PRs opened, comments addressed, features shipped, carry-overs.
6. **Do not push.** Pushing main or feature branches is an explicit user action.

If `work.md` is already gitignored or absent (per the repo's `.gitignore` which lists `/work.md`), skip the commit and just append to the local file. Tell the user that `work.md` is gitignored, so the commit step was skipped.

## `off` subcommand

Disengage. Print "Orchestrator mode disengaged." and return to plain assistant behavior. The work-log discipline and proactive surfacing stop.

## Interaction with feature-pipeline

The orchestrator and feature-pipeline are layered, not overlapping:

- **Orchestrator can recommend running feature-pipeline** in its `next` output ("Start /feature-pipeline supervised spec/feature-6-income-ratio.md").
- **Orchestrator reads `.claude/pipeline-state.json`** to know if mid-feature.
- **Orchestrator does NOT** dispatch feature-pipeline automatically — the user does that explicitly.
- **feature-pipeline does NOT** call orchestrator. It writes to `.claude/pipeline-state.json` so orchestrator can see its state.

If both are engaged (user is mid-pipeline AND has orchestrator on), the orchestrator stays quiet during pipeline gates and only surfaces things between phases.

## Edge cases

- **Multiple parallel features.** Orchestrator handles N branches. Status shows them all. Next prioritizes the most-blocked one.
- **A PR was merged externally.** Detect via `gh pr view <n> --json state` returning `MERGED`. Suggest deleting the local branch and retargeting any PRs that depended on it.
- **A spec was added but the user isn't ready to build it yet.** Surface in status but don't push action; `next` deprioritizes specs marked as "future:" or with explicit "Coming soon" / "Deferred" markers in the file.
- **`work.md` is missing entirely.** Create it with a header before appending.

## Hard rules

1. **GitHub scope is `yechi666/budget` only.** Never query, comment on, or modify the parent fork or other repos.
2. **`wrap` commits `work.md` and ONLY `work.md`.** Don't fold in other dirty files. Don't push.
3. **Auto-dispatch:** in supervised mode, never auto-dispatch sub-agents (recommend, then wait). In auto mode, dispatch is the whole point, but only via the documented loop and within the safety boundaries above.
4. **Don't auto-merge PRs, ever.** Even if status shows them as mergeable. Even in auto mode.
5. **In supervised mode, stay in main thread.** In auto mode, dispatch sub-agents freely but watch token usage (the auto-mode token-discipline section above).
6. **Never run anything that prompts for input** (credentials, 2FA codes, confirmation dialogs). These are blockers.
7. **State file `.claude/orchestrator-state.json` is the source of truth for auto mode.** Always write before stopping; always read on `resume`.

## Token economy

- Default banner is under 200 words. The stance has no per-turn token cost beyond context.
- `status` and `next` use `gh` JSON with `--jq` filters to keep responses small.
- Don't re-fetch everything every turn; cache the last status result and only refresh on explicit subcommand or on a turn where the user's request changes project state (push, PR create, branch change).

## Notes

- The skill never replaces user judgment. Recommendations are inputs, not directives.
- If you (the user) want to silence proactive surfacing temporarily without disengaging fully, just say so; the assistant will respect that for the next N turns.
