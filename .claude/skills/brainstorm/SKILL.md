---
name: brainstorm
description: Runs a multi-persona brainstorm session. Discovers persona skills under `.claude/skills/persona-*` at runtime, filters them by mode (dev or general), picks the N most relevant to the topic, dispatches one sub-agent per persona in parallel, and synthesizes a recommendation. Supports pinning specific personas, excluding personas, controlling the count, and injecting random "wild" voices for serendipity. Use when the user invokes `/brainstorm <topic>` or asks for a multi-perspective discussion. Default mode is dev (architecture / scope / deployment / threat model); use `general` for non-technical decisions (career, business, life, strategy). Scalable: drop a new `.claude/skills/persona-<name>/SKILL.md` with the right `modes:` and it joins automatically.
---

# Brainstorm

A multi-persona brainstorm session on a single topic. Personas live as skills under `.claude/skills/persona-*` and are discovered at runtime, so the pool grows by adding a single skill file with the right `modes:` frontmatter.

## Invocation

```
/brainstorm [mode] <topic or question> [options]
```

- `mode` (optional): `dev` (default) or `general`. Filters which personas are eligible.
- `topic`: the free-text question or proposal.

Options (anywhere in the command):
- `personas=<slug1,slug2,...>` — pin specific personas (slugs without the `persona-` prefix). They will be in the active pool regardless of relevance scoring. Any remaining slots up to `count` are filled by relevance.
- `exclude=<slug1,slug2,...>` — drop personas from consideration entirely.
- `count=N` — number of personas to dispatch (default: 5). Hard-capped at the size of the filtered pool.
- `wild=N` — inject N random personas from the unselected-but-eligible pool to add serendipity (default: 0).
- `rounds=1|2|auto` — control the rebuttal round (default `auto`, decided by self-review).
  - `rounds=1`: skip rebuttal even if self-review wants it (fast, half the cost).
  - `rounds=2`: force a rebuttal round even if self-review doesn't see talking-past-each-other (use when the user or orchestrator wants the sharpened version regardless).
  - `rounds=auto`: let the orchestrator self-review decide after round 1.

Examples:
- `/brainstorm should we deploy Spent as a PWA or native iOS?`
- `/brainstorm general should I take the job in Berlin or stay in Tel Aviv?`
- `/brainstorm where should we store user-encrypted backups? personas=privacy-maximalist,security-architect count=4`
- `/brainstorm what's the right MVP for Bit auto-detect? exclude=privacy-maximalist wild=2`
- `/brainstorm general how should I structure my LLC? count=3`
- `/brainstorm should we add cloud sync? rounds=2` — force the rebuttal round
- `/brainstorm rename a function for clarity? rounds=1` — quick single round

## Persona discovery + selection

At the start of every run:

1. **Discover.** Glob `.claude/skills/persona-*/SKILL.md` from the project's `.claude/skills/`. The slug is the directory name (e.g., `persona-pre-mortem`).
2. **Read frontmatter** for each persona. Capture `name`, `description`, and `modes`. If `modes:` is absent, default to `[dev]` for backward compatibility.
3. **Filter by mode.** Keep only personas whose `modes` contains the requested mode.
4. **Apply user filters.**
   - If `exclude=...` is set, drop those slugs from the candidate pool.
   - If `personas=...` is set, force-include those slugs (they bypass relevance scoring). If any pinned slug isn't in the filtered pool, warn the user and skip it.
5. **Relevance-rank the remaining candidates.** Read each persona's description and worldview summary against the topic. Score each on a 1-5 scale: how directly does this persona's lens apply to *this specific topic*? Take the top `count - pinned_count` by score.
6. **Inject `wild` random personas.** If `wild=N` and there are unselected eligible personas left, randomly pick N of them and add to the active pool. (Wild personas come from the same mode-filtered pool — no skipping mode filters.)
7. The final **active pool** is: pinned + relevance-top-up + wild.

If the active pool is empty (e.g., pinned slugs are all invalid in this mode, or no `persona-*` skills exist for this mode), stop and tell the user.

If the active pool size exceeds the candidate pool, cap at the candidate pool size and tell the user.

Token economy: discovery + frontmatter reads + relevance scoring add roughly ~2000 tokens. Cheap compared to N dispatch costs.

## Session protocol

### Round 1 (always runs)

For each persona in the active pool, dispatch a sub-agent **in parallel** (single message, multiple Agent tool calls). Use `subagent_type: general-purpose` for each.

Sub-agent prompt template:

```
You are participating in a brainstorm session as one of multiple voices. Your job:

1. Invoke the `<persona-slug>` skill from .claude/skills/. The skill defines your worldview, your axioms, your response protocol, and your output format.
2. Respond to the following topic in that voice:

<topic + any context the user provided>

Mode of this brainstorm: <dev|general>
- If `dev`: the topic is a software / architecture / feature decision. Persona examples likely apply directly.
- If `general`: the topic is a non-technical decision (career, business, life, strategy). Adapt the persona's worldview and axioms to this domain. If the persona's body has code-flavored examples, translate them to the topic's domain — the worldview is what matters, not the examples.

Constraints for this brainstorm:
- Read code only to ground your argument if relevant. Do NOT write or edit any file.
- Do not dispatch other agents.
- Do not invoke other persona skills — stay in your assigned persona.
- Open your output with the persona's tag line (e.g., `**Privacy maximalist:**`) so the synthesizer can identify it.
- End with a one-line verdict per the persona's response protocol.

Reply with your full position (markdown, under 400 words).
```

Wait for all to return. Save each output to `.claude/brainstorm/<topic-kebab>/round-1.md` with a `## <persona-slug>` header per voice.

### Orchestrator self-review (cheap, mandatory unless overridden)

Resolve the rounds decision in this order:

1. **If `rounds=1`** was passed: skip round 2 unconditionally. Synthesize from round 1 only. No self-review needed.
2. **If `rounds=2`** was passed: run round 2 unconditionally. Note in the synthesis that rebuttal was force-requested by the user/orchestrator.
3. **If `rounds=auto`** (the default): perform self-review. Read the round-1 outputs and ask:
   - **Do they agree?** If all reach the same verdict, no round 2 needed.
   - **Do they disagree cleanly?** If they disagree but the disagreement is *productive* (each argument stands without further interrogation), no round 2 needed; synthesize directly.
   - **Do they talk past each other?** If they're addressing different parts of the question or making assumptions the others would reject, round 2 will sharpen the analysis.
   - **Did any persona over-promise or under-justify?** If one verdict is bold but thinly supported, round 2 lets the others push back.

   If round 2 is warranted, surface the rationale: "Pragmatic shipper and pre-mortem are talking past each other on [topic X]; running a rebuttal round."

### When to use `rounds=2` explicitly

- The user wants the sharpest possible synthesis on a high-stakes decision and is willing to pay double-cost.
- The orchestrator is running brainstorm autonomously (e.g., as part of `/orchestrator auto`) on an irreversible decision and wants the safety margin of an enforced rebuttal.
- An earlier round-1-only run produced a synthesis the user felt was thin; rerun with `rounds=2` to deepen it.

### When to use `rounds=1` explicitly

- Quick exploration where one round of perspectives is enough.
- Low-stakes decision and you want to keep cost bounded.
- You already know the rough answer and just want the personas to surface anything you missed.

### Round 2 (optional, rebuttals)

Re-dispatch each persona's sub-agent in parallel with:
- Their own round 1 output
- The other personas' round 1 outputs
- A prompt: "Read the other voices' positions. Where do you concede? Where do you push back? Update your verdict if your concession warrants it. Under 250 words. Stay in your assigned persona — still invoking the `<persona-slug>` skill."

Save to `.claude/brainstorm/<topic-kebab>/round-2.md`.

### Synthesis (orchestrator, main thread)

After round 1 (or round 1 + 2), write a synthesis to `.claude/brainstorm/<topic-kebab>/synthesis.md`:

```markdown
# Brainstorm: <topic>

## Question
<the topic as posed>

## Mode
<dev|general>

## Pool
<comma-separated persona slugs that participated>
<note any `personas=` pins, `exclude=` filters, or `wild=` injections>

## Positions (one paragraph per persona)

**<Persona tag>:** <position + key argument>
...

## Where they agreed

<bullet list of converged points>

## Where they disagreed (productively)

<bullet list with each persona's strongest argument on the contested points>

## Synthesis

<orchestrator's recommendation, engaging with each persona's strongest objection. Cite specific points.>

## Decisions surfaced for the user

<bullet list of choices the brainstorm exposes that need a human call>
```

The synthesis is opinionated — it picks a direction — but shows the reasoning so the user can override.

## Mode reference

### `dev` mode (default)

For software, architecture, deployment, scope, threat model, sync/storage, feature design. The pool draws from all dev-tagged personas; many universal-stance ones (devils-advocate, first-principles, pre-mortem, dreamer, evidence-demander, ethicist, reversibility-advocate) participate in both modes.

Typical dev-mode active pool by topic flavor:
- **Data/sync/storage decisions:** privacy-maximalist + security-architect + reversibility-advocate + pre-mortem + (one universal)
- **Scope debates:** pragmatic-shipper + dreamer + devils-advocate + evidence-demander + first-principles
- **UI/feature decisions:** ux-humanist + pragmatic-shipper + evidence-demander + first-principles + (one critical)

(These are relevance-scoring intuitions, not hardcoded mappings.)

### `general` mode

For non-technical decisions: career, business strategy, life choices, organizational issues, ethical questions, anything where the topic doesn't intersect code. The pool is smaller (only personas tagged with `general` in their `modes:`) and the dispatched sub-agents adapt examples from "code" to the topic's actual domain.

Typical general-mode active pool:
- **Career/life decisions:** pre-mortem + reversibility-advocate + maintenance-realist (commitments-decay framing) + dreamer + first-principles
- **Business strategy:** pragmatic-shipper + dreamer + evidence-demander + devils-advocate + ethicist
- **Organizational/team decisions:** ethicist + first-principles + devils-advocate + pre-mortem + (relevant other)

### Adding a new mode

If you want a third mode (e.g., `research`, `creative`, `medical`), add it to relevant personas' `modes:` array and update this skill's "Mode reference" section. No code changes — purely a frontmatter convention.

## Token economy

- Round 1 = N parallel sub-agent calls, where N = `count` (default 5). Cost scales linearly with persona count; this is the dominant factor.
- Each sub-agent's brief is small (topic + which skill to invoke + mode); the persona's worldview lives in its skill body.
- Relevance scoring in the main thread costs ~1500 tokens before any dispatch.
- Round 2 = N more sub-agent calls. Run only when self-review justifies it.
- Synthesis = orchestrator in main thread; no extra dispatch.

For very small / clear questions, don't use brainstorm; directly invoke the single most relevant persona skill (`/skill persona-<slug> <topic>`) in the main thread.

## When to use

- Architectural decisions (storage location, sync model, framework choice)
- Scope questions (MVP shape, what to defer)
- Deployment decisions (channel, hosting, versioning)
- Threat model + control set decisions
- Career/life/business decisions with non-obvious tradeoffs
- Any decision where the user benefits from seeing multiple sharp perspectives at once

## When NOT to use

- A clearly-defined implementation question (use `/feature-planner` against a spec)
- A code-style or convention question (look at STANDARDS.md)
- A factual research question (use general-purpose agent directly)
- Anything with a strictly correct answer
- Single-perspective analysis (just invoke one persona skill directly)

## File outputs

```
.claude/brainstorm/
└── <topic-kebab>/
    ├── round-1.md          # all personas' round 1 outputs
    ├── round-2.md          # (optional) rebuttals if needed
    └── synthesis.md        # orchestrator's final synthesis + decision
```

These are gitignored (under `.claude/`). Promote to `docs/architecture/` or `spec/` if the conclusion warrants a permanent home.

## Adding a new persona

1. Drop a new file at `.claude/skills/persona-<slug>/SKILL.md`.
2. Frontmatter must include `name: persona-<slug>`, a `description:` summarizing the worldview, and `modes: [dev]`, `modes: [general]`, or `modes: [dev, general]`.
3. Body follows the existing convention: axioms, what-you-challenge, what-you-concede, response protocol, format, hard rules.
4. The next `/brainstorm` run will include it in the relevant mode's pool automatically and the relevance scorer will use its description.

## Hard rules

1. **Always parallel for round 1.** The personas don't see each other's drafts until round 2. This preserves independent positions.
2. **Round 2 is opt-in by default.** With `rounds=auto`, don't burn tokens unless self-review shows it's warranted. With `rounds=2`, run it because the user/orchestrator asked for it.
3. **The synthesis takes a position.** No "it depends" cop-outs. Pick a direction; explain why each persona's strongest objection is handled or accepted.
4. **The user always has the final call.** The brainstorm is input, not a decision.
5. **Sub-agents must invoke the persona skill.** Don't paste persona instructions into the dispatch prompt — that bloats every call and loses the single-source-of-truth property. The dispatch names the skill; the skill body is loaded inside the sub-agent.
6. **Relevance, not randomness.** Default selection is relevance-weighted, not random. Randomness is opt-in via `wild=N` for serendipity, not the default mechanism.
7. **Respect user pins.** When `personas=...` is provided, those personas run even if relevance scoring would have skipped them. The user knows their topic.
8. **Cap count at pool size.** If `count=10` but only 7 personas match the mode, run with 7 and tell the user.
