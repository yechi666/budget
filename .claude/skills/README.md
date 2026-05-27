# Skills

A cheat sheet for the project's skills. Each skill's `description:` is also auto-loaded into Claude's context every turn, so this file is for humans navigating the directory, not for the model.

## Workflow (single-feature pipeline)

Run these in order to take a feature from idea to PR. `feature-pipeline` automates the chain; the individual skills can also run on their own.

| Skill | Use when | Reads | Writes |
|---|---|---|---|
| `spec-writer` | Drafting ONE spec file from a brief | `spec/`, code | `spec/feature-N-*.md` |
| `feature-planner` | Turning an existing spec into a structured implementation plan | a spec file | `.claude/pipeline/plan.md` |
| `wireframer` | Sketching the UI before the detailed plan (only when UI work is involved) | spec + plan | `.claude/pipeline/wireframe.md` |
| `ui-planner` | Translating an approved wireframe into a detailed component plan | wireframe + plan | `.claude/pipeline/ui-plan.md` |
| `feature-tester` | Writing failing tests against the locked plan | plan + ui-plan | `src/__tests__/*.test.ts` |
| `feature-dev` | Implementing production code to satisfy the failing tests | plan + tests | code under `src/` |
| `feature-reviewer` | Reviewing the feature diff against spec + STANDARDS | spec + diff | nothing (punch list output) |

## Multi-feature / orchestration

| Skill | Use when |
|---|---|
| `plan-feature` | A big idea needs to be split into 3-7 sub-features, each with its own spec file |
| `feature-pipeline` | Driving one already-specced feature through all phases above |
| `orchestrator` | Stance for managing the project across features (status, next-action, auto-mode) |

## Brainstorm

| Skill | Use when |
|---|---|
| `brainstorm` | Multi-persona discussion. `mode=dev` for technical decisions; `mode=general` for non-technical (career, business, life) |

### Brainstorm options

```
/brainstorm [mode] <topic> [personas=...] [exclude=...] [count=N] [wild=N] [rounds=1]
```

- `mode`: `dev` (default) or `general`. Filters which personas are eligible.
- `personas=slug1,slug2,...`: pin specific personas (slugs without `persona-` prefix). Always included regardless of relevance.
- `exclude=slug1,slug2,...`: drop personas from consideration.
- `count=N`: number of personas (default `5`). Capped at the size of the filtered pool.
- `wild=N`: inject N random eligible personas for serendipity (default `0`).
- `rounds=1|2|auto`: control the rebuttal round. `auto` (default) lets self-review decide; `1` skips rebuttal; `2` forces it (user/orchestrator override for high-stakes decisions).

### Personas

| Slug | Modes | Worldview / stance |
|---|---|---|
| `persona-privacy-maximalist` | dev | Zero third-party trust for user data |
| `persona-pragmatic-shipper` | dev, general | Smallest shippable version wins |
| `persona-security-architect` | dev | Every system has a threat model |
| `persona-maintenance-realist` | dev, general | Software (and commitments) die in year two |
| `persona-ux-humanist` | dev | The user's feeling is a feature |
| `persona-devils-advocate` | dev, general | Stance: steelman the opposite and attack |
| `persona-reversibility-advocate` | dev, general | One-way doors vs two-way doors |
| `persona-pre-mortem` | dev, general | Stance: assume failure, write the autopsy |
| `persona-first-principles` | dev, general | Stance: strip to atoms, rebuild |
| `persona-dreamer` | dev, general | The ambitious version is often achievable |
| `persona-ethicist` | dev, general | Second-order effects on people not in the room |
| `persona-evidence-demander` | dev, general | "Show me the data" |

**Dev pool** (12 personas): all listed above. The three dev-only worldviews (privacy-maximalist, security-architect, ux-humanist) sit alongside the universal stances and worldviews.
**General pool** (9 personas): pragmatic-shipper, maintenance-realist, devils-advocate, reversibility-advocate, pre-mortem, first-principles, dreamer, ethicist, evidence-demander.

## Utility

| Skill | Use when |
|---|---|
| `sqlite-migration` | Adding or modifying a migration in `src/server/db/migrations/` |

## Adding a new persona

1. Create `.claude/skills/persona-<slug>/SKILL.md`.
2. Frontmatter: `name: persona-<slug>`, one-line `description:`, and `modes: [dev]`, `[general]`, or `[dev, general]`.
3. Body: follow the convention (axioms, what-you-challenge, what-you-concede, response protocol, format, hard rules).
4. The next `/brainstorm` run will discover it via the `persona-*` glob, filter by mode, and include it via relevance scoring or `personas=` pinning — no edits to `brainstorm` needed.

## Adding a new workflow skill

1. Create `.claude/skills/<slug>/SKILL.md`.
2. If it fits the pipeline phases above, also reference it from `feature-pipeline/SKILL.md` under the relevant phase.
3. If it's a standalone tool, just leave it discoverable via its description.

## Adding a new brainstorm mode

If you want a third mode (e.g., `research`, `creative`), add it to relevant personas' `modes:` array and update brainstorm's "Mode reference" section. Purely a frontmatter convention — no code changes.

## Relationships at a glance

```
spec idea
  └── plan-feature        (split into multiple sub-specs)
        └── spec-writer   (refine a single spec file)
              └── feature-pipeline
                    ├── feature-planner
                    ├── (wireframer → ui-planner) if UI
                    ├── feature-tester
                    ├── feature-dev
                    └── feature-reviewer

decision / question
  └── brainstorm [dev|general]
        └── relevance-ranks the persona-* pool, picks N (default 5)
              ├── persona-* (mode-tagged in frontmatter)
              └── runs each in a parallel sub-agent that invokes the skill

session-level driving
  └── orchestrator
        └── (recommends or dispatches feature-pipeline, brainstorm, etc.)
```
