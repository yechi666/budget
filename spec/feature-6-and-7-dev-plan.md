# Dev plan: Features 6 & 7

A short notes-to-self for when we pick these up. Specs are in `feature-6-income-ratio.md` and `feature-7-bit-integration.md`.

## Feature 6 — Income Ratio

### Suggested sequence

1. **Migration 024** — Add `categories.counts_as_income` column, seed obvious income categories. One-line migration; low risk.
2. **Server: query layer** — In `balance.ts`:
   - Add `getIncomeRatiosByMonth(workspaceId): Map<string, { a: number; b: number; ratioA: number }>` returning ratios keyed by **salary month** (not transaction month).
   - Update the main balance loop to handle `effectiveType === 'ratioed'`: look up `addMonth(txMonth, 1)` in the ratio map, fall back to 0.5 if missing.
   - Add `incomeRatioMonths` to `BalanceResponse`.
3. **API:** PATCH /api/categories/:id accepts `countsAsIncome`. GET /api/balance/income-ratios returns the breakdown.
4. **UI:**
   - Category detail sheet: "Counts as income" switch (gated on `kind === 'income'`).
   - Balance page monthly table: "by income" badge on rows that used the ratio.
   - Balance page: collapsible "Income ratios" section under the monthly table.
   - Settings > Categories sheet + transactions sharing chip: drop the "(coming soon)" suffix from the Ratioed label.
5. **Tests (TDD):**
   - Ratio math: A=8000, B=2000 income in May → ratio_A = 0.8. Ratioed expense 100 paid by A in April → B owes 80, A owes 20, balance delta = +80 in A's favor.
   - Fallback: no income data → 0.5 split.
   - Edge: both zero → 0.5 split.
   - Month-shift: a December transaction uses January income (year wraparound). Test the date math explicitly.
   - sharing_override on a ratioed-category transaction still wins.
   - Toggling `counts_as_income` recomputes correctly.

### Effort estimate

~1 day. The migration + math is small; the UI for the income ratios section is the biggest piece.

### Risks

- **Month-shift bug** — easy to off-by-one. Write the test for December → January FIRST before any code.
- **Income definition drift** — users will tweak `counts_as_income` over time and balances will shift retroactively. This is correct behavior, but surface it: show "Recomputed from new income settings" toast after toggling.
- **Performance** — for users with 10 years of data, the per-month income map is still small (~120 entries), no concern.

### Hand-off note for the spec when picked up

Confirm with the user: should `transfer` and `Refunds & Reimbursements` definitively NOT count as income? The seed assumes no. Easy to change at migration time.

---

## Feature 7 — Bit Integration

### Suggested sequence

1. **Empirical step (do this BEFORE coding)** — Sync a real workspace that has actual Bit transfers. Look at the raw `description` text the scrapers produce, per provider. Build the keyword list from observation, not guess. This is 30 min of poking at the DB.
2. **Migration 025** — `settlement_transactions` join table + `settlements.source` column.
3. **Server: detection function** — `src/server/sync/bit-detector.ts` (new):
   - `detectBitSettlements(workspaceId, opts?: { sinceDate? }): { created: Settlement[]; matched: { debitTxId: number; creditTxId: number; settlementId: number }[] }`.
   - Pure-ish: pulls Bit-tagged transactions, walks pair candidates, inserts settlements + links in a DB transaction per match.
4. **Server: orchestrator hook** — In `src/server/sync/orchestrator.ts`, call the detector at end-of-sync. Emit SSE events per match. Never abort the sync on detector errors — wrap in try/catch with a warning log.
5. **Server: balance engine** — Exclude link-referenced transactions from the shared-expense math.
6. **API:**
   - GET /api/balance/settlements: include `source` in the response.
   - DELETE /api/balance/settlements/:id: when source='bit-auto', also un-exclude linked transactions.
   - POST /api/balance/bit-redetect: re-run on demand.
7. **UI:**
   - Settlements list: `Sparkles` icon for auto-detected rows.
   - Delete confirmation copy for auto-detected vs manual.
   - Settings > Data: toggle + re-detect button.
   - Transactions page: muted "linked to settlement" badge on link-referenced rows.
   - Toast in home page when sync detects new ones.
8. **Tests:**
   - Detection: insert a matched debit/credit Bit pair on different partners → settlement created, both txs linked.
   - No match on same-partner pair (sanity).
   - No match when amounts differ.
   - 2-day window: dates 1 day apart match; 3 days apart don't.
   - Deleting an auto-detected settlement re-includes the transactions.
   - Re-running detection on an already-linked transaction is a no-op (UNIQUE constraint).
   - Workspace isolation.

### Effort estimate

~2 days. The empirical keyword discovery + careful pair-matching dominate. UI is straightforward.

### Risks

- **Keyword brittleness** — the highest-risk part. Mitigation: hard-coded list for v1 + Settings hook to extend it later if needed. Always show what got detected so the user can manually unlink wrong matches.
- **Race with manual settlement** — user logs a manual settlement; later sync detects the underlying Bit and creates a second one. Mitigation: check for an existing manual settlement within ±2 days for the same amount/partners before auto-creating; if found, skip + log "manual settlement already present".
- **Bit P2P split-bills** — Bit supports "request payment from multiple people". The scraper view of these is one transfer per person, which our algorithm handles fine if each pair matches. Edge case to verify with real data.
- **Existing transactions on first run** — when this ships, users will have months of historical Bit transfers. Run detection retroactively on a manual "Re-detect" trigger; do NOT auto-create on first run since the user may have already logged some manually.

### Hand-off note for the spec when picked up

Decide: should auto-detected settlements be created on the first sync after this feature ships, or only on transactions newer than `feature_enabled_at`? Recommendation: only newer, with a manual "Re-detect last N months" button for retroactive cleanup.

---

## Combined sequencing

Features 6 and 7 are independent — neither depends on the other. Ship 6 first (simpler, higher user value, no external string parsing). Then 7.
