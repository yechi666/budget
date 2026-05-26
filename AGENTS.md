<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:subagent-dispatch -->
# Sub-agent dispatch checklist

When dispatching a sub-agent (via the Agent tool), follow this checklist. These rules exist because they've been violated and broken pipelines in this repo before.

## Prefer the custom agents

For Spent feature work, dispatch by these custom agent types instead of `general-purpose` with a long brief:

- **`planner`** — produces structured feature plans from a spec
- **`tester`** — writes failing tests as a locked contract
- **`dev`** — implements against tests with branch-discipline rules
- **`reviewer`** — reviews diffs for correctness bugs and unmet ACs

Briefs and rules are baked into each agent's system prompt. Pass only the spec path, the locked plan, the branch name, and any orchestrator decisions.

## Branch discipline

- Run `git branch --show-current` BEFORE and AFTER any dev or test agent. Agents have been observed to silently switch branches; their work then ends up on the wrong one and gets lost.
- If the post-dispatch branch differs from the pre-dispatch branch, the work is on the wrong branch. Move it or redo.
- Untracked files DO follow you across `git checkout` (handy for surfacing failures). Modified files DON'T move silently — they error or get committed first.

## Tests are immutable to dev agents

- Sub-agents (especially `dev`) MUST NOT modify any file in `src/__tests__/`. If a test seems wrong, they STOP and report.
- Orchestrator (the main-thread Claude) is the ONLY agent that may edit tests. Decisions like "this fixture should use a unique name" are orchestrator calls.
- Equally: sub-agents MUST NOT modify production schema (migrations) to satisfy a weak test fixture. The fix goes in the test, not the migration.

## Anti-scope-creep

- If the plan didn't list it, the agent doesn't build it. No "while I'm here" refactors. No unrelated dependency bumps. No new migrations beyond what the plan calls for.
- If the agent thinks the plan is missing something, it surfaces a note in its output — it doesn't add the work.

## Stop-and-report triggers

The dev agent stops (does not work around) when it encounters:
- Test fixture conflicts with seed data (e.g. inserting "Groceries" into workspace 1)
- Tests that expect a field not in the plan
- Tests that require modifying an already-shipped migration
- Contradictions between two tests
- Confusion about which branch / what plan / what contract

## GitHub workflow

- `gh pr create --body-file <path>` — never `--body "<long string>"`. The permission hook in `.claude/settings.json` blocks long inline bodies.
- For working on a fork with an upstream parent: `gh repo set-default <your-fork>` so `gh pr list` shows your PRs, not the parent's.
- For inline review comments: use `gh api repos/<owner>/<repo>/pulls/<n>/comments` (NOT `issues/<n>/comments` — that only returns top-level PR comments).
- Replying to a specific inline review comment: `mcp__github__add_reply_to_pull_request_comment` with `commentId`.
- Retargeting a PR after its parent merges: `gh pr edit <n> --base main`.
<!-- END:subagent-dispatch -->
