# Coding Standards

Concrete rules for writing code in this repo. When in doubt, look at existing code first.

---

## TypeScript

- `strict: true`. No `any` unless a comment explains why.
- All domain types live in `src/lib/types.ts`. Extend with suffixes: `TransactionWithCategory`, `CategoryWithData`.
- Discriminated unions for status/kind values: `"expense" | "income" | "transfer"`, never magic strings scattered in code.
- Type-only imports always use the `type` keyword: `import type { Foo } from "@/lib/types"`.
- Mixed imports: `import { fn, type Foo } from "@/lib/types"`.
- Raw DB row shapes get their own `interface` (snake_case fields); convert to camelCase in a mapper function.
- Prefer `null` over `undefined` for missing data returned from queries. Return `T | null`, not `T | undefined`.
- Null-coalescing over optional chaining when a fallback is needed: `row ?? null` not `row?.field`.
- Never use non-null assertion (`!`) on values that could genuinely be null.

---

## Imports

- All imports use the `@/` alias. Never use relative paths (`../`, `./`) except inside `src/server/db/` for sibling files.
- Every file in `src/server/` starts with `import "server-only"` as the first line.
- Import order: `"server-only"` guard, then Node built-ins, then third-party, then internal (`@/server/...`, `@/lib/...`, `@/components/...`).

---

## React components

- Default to server components. Add `"use client"` only when you need: state, effects, browser APIs, event handlers, or TanStack Query.
- `"use client"` goes on the first line, before any imports.
- One component per file. File name matches the exported component in kebab-case: `sync-button.tsx` exports `SyncButton`.
- Define props inline above the component with `interface Props { ... }`. Destructure in the function signature.
- No default exports for components. Use named exports: `export function Dashboard() { ... }`.
- Children: use `children: React.ReactNode` in props, not slot patterns.
- Avoid wrapper `<div>`s just for layout -- put the layout class on the component root if possible.

**shadcn/ui rules:**
- `asChild` does not exist. Use the `render` prop or style the primitive directly.
- `Select.onValueChange` returns `string | null`, handle both.
- Custom variants use `cva()` from `class-variance-authority`. Add `className` as an override prop and merge with `cn()`.

---

## Styling

- All styles via Tailwind utility classes. No inline `style={{}}` except for dynamic CSS variables: `style={{ "--color": value }}`.
- Theme tokens defined in `globals.css` under `@theme`. Never in `tailwind.config.js`.
- Dynamic colors: `text-[var(--status-over)]` not hardcoded hex.
- `cn()` from `@/lib/utils` merges class strings. Always use it when combining conditional classes.
- Responsive: mobile-first. `md:` and `lg:` breakpoints. Grid layout via `grid-cols-12` with span classes.
- Spacing scale: 4 = tight, 6 = standard section gap, 8 = page-level padding.

---

## API routes

- File at `src/app/api/<resource>/route.ts`. Nested routes: `src/app/api/<resource>/[id]/route.ts`.
- Handler signature: `export async function GET(request: Request)`.
- Success response: `NextResponse.json(data)`.
- Error response: `NextResponse.json({ error: "message" }, { status: 400 })`. Always lowercase `error` key.
- Extract workspace early: `const workspaceId = getWorkspaceIdFromRequest(request)` as the first line.
- Parse query params defensively: `.map(Number).filter(Number.isFinite)` for numeric arrays.
- Null-coerce missing params: `searchParams.get("key") ?? undefined`.
- Wrap request body parsing in try/catch; return 400 on parse failure.
- Validate required string fields: `typeof x !== "string" || x.trim().length === 0`.
- All mutating routes (POST, PATCH, DELETE) are protected by the CSRF middleware automatically.

---

## Database queries

- All query functions live in `src/server/db/queries/`. One file per domain: `transactions.ts`, `categories.ts`, etc.
- Workspace ID is always the first parameter.
- Use `.prepare().get()` for single-row queries; cast result as `RowType | undefined`, return `null` if missing.
- Use `.prepare().all()` for multi-row queries; cast result as `RowType[]`.
- Use `.prepare().run()` for writes. Check `result.changes` when needed.
- Build dynamic WHERE clauses with a conditions array and values array:
  ```ts
  const conditions: string[] = ["workspace_id = ?"];
  const values: (string | number)[] = [workspaceId];
  if (params.from) { conditions.push("date >= ?"); values.push(params.from); }
  const sql = `SELECT ... WHERE ${conditions.join(" AND ")}`;
  ```
- Use `db.transaction()` for multi-statement writes.
- `COALESCE(SUM(...), 0)` for aggregates that should default to 0.
- Dates stored as ISO strings (`YYYY-MM-DD`). No timestamps in query layer -- format in the caller.

**Migrations:**
- Sequential SQL files in `src/server/db/migrations/`, numbered `001_*.sql`, `002_*.sql`, etc.
- Never alter an existing migration file. Add a new migration.
- For adding a NOT NULL FK column: use the table-recreate pattern (CREATE new, INSERT INTO, DROP old, RENAME).
- SQLite `COLLATE NOCASE` goes in the column definition in the migration, not in individual queries.

---

## State management

**TanStack Query:**
- All client data fetching through `useQuery` / `useMutation`. No raw `fetch` in components.
- Query keys: `["resource"]` for lists, `["resource", id]` for single items, `["resource", param1, param2]` for filtered lists.
- After a mutation succeeds, invalidate all affected query key prefixes: `queryClient.invalidateQueries({ queryKey: ["resource"] })`.
- Typed query functions come from `src/lib/api.ts`. Add new fetch helpers there, not inline.

**Workspace store:**
- Read: `useActiveWorkspaceId()` in components, `getActiveWorkspaceIdSync()` in non-React code.
- Write: `setActiveWorkspaceId(id)` -- this persists to localStorage automatically.
- The `x-workspace-id` header is injected automatically by `src/lib/api.ts`. Never set it manually in fetch calls.

---

## Utility patterns

**Null-safe localStorage:**
```ts
if (typeof window === "undefined") return null;
try { return window.localStorage.getItem(KEY); } catch { return null; }
```

**SSE stream parsing:** Follow the pattern in `src/lib/api.ts`. Buffer lines, split on `\n`, parse `event:` and `data:` prefixes.

**Error wrapping:** `err instanceof Error ? err.message : String(err)`. Never swallow errors silently unless you have a specific reason and a comment.

**Exhaustive switches:** When switching on a discriminated union, handle every case. TypeScript will catch missing cases.

**Dynamic placeholders for SQL IN clauses:**
```ts
const placeholders = ids.map(() => "?").join(",");
conditions.push(`id IN (${placeholders})`);
for (const id of ids) values.push(id);
```

---

## Security

- Credentials are encrypted before storing. Always use `encrypt()` / `decrypt()` from `src/server/lib/encryption.ts`.
- Never log credential values, even in debug paths.
- CSRF: the middleware in `src/middleware.ts` blocks cross-origin POST/PATCH/DELETE automatically. Do not bypass it.
- Validate and sanitize all user input at the API boundary (route handlers), not deeper in the stack.

---

## Naming conventions

- No single-letter variable names (except loop indices). Use descriptive names: `tPartners` not `t`, `credentials` not `c`.
- No number suffixes in variable names. Express intent instead: `firstPartnerName` / `secondPartnerName`, not `name1` / `name2`.
- i18n translation hooks: name the variable after the namespace, e.g. `const tPartners = useTranslations("settings.partners")`.

---

## Conventions (non-negotiable)

- No em dashes (`--` or `—`) anywhere: code, comments, commits, docs.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- No trailing summaries or "what I changed" comments in code. That belongs in the commit message.
- Write comments only for non-obvious *why*, not *what*. One line max.
- File names: kebab-case for everything except migrations (which are `NNN_description.sql`).
