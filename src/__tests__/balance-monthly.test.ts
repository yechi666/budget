import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb, insertCredential } from "./helpers/db";
import { getBalance } from "@/server/db/queries/balance";
import { createPartner } from "@/server/db/queries/partners";

const WS = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertSyncRun(db: Database.Database): number {
  const result = db
    .prepare(
      `INSERT INTO sync_runs
         (workspace_id, provider, started_at, status, scrape_from_date, transactions_added, transactions_updated)
       VALUES (1, 'test', datetime('now'), 'completed', '2024-01-01', 0, 0)`
    )
    .run();
  return Number(result.lastInsertRowid);
}

interface InsertTxnOpts {
  syncRunId: number;
  credentialId: number;
  categoryId?: number | null;
  chargedAmount?: number;
  date: string;
  kind?: string;
  dedupHash?: string;
}

function insertTransaction(db: Database.Database, opts: InsertTxnOpts): void {
  db.prepare(
    `INSERT INTO transactions
       (workspace_id, account_number, date, processed_date, original_amount,
        original_currency, charged_amount, description, type, status,
        provider, sync_run_id, dedup_hash, dedup_sequence, kind,
        is_excluded, credential_id, category_id)
     VALUES (1, 'ACC1', ?, ?, 100, 'ILS', ?,
             'TestMerchant', 'normal', 'completed', 'test', ?, ?, 0, ?,
             0, ?, ?)`
  ).run(
    opts.date,
    opts.date,
    opts.chargedAmount ?? -100,
    opts.syncRunId,
    opts.dedupHash ?? `hash_${Date.now()}_${Math.random()}`,
    opts.kind ?? "expense",
    opts.credentialId,
    opts.categoryId ?? null
  );
}

function insertCategory(
  db: Database.Database,
  name: string,
  sharingType = "fixed",
  fixedRatio = 0.5
): number {
  const result = db
    .prepare(
      `INSERT INTO categories
         (workspace_id, parent_id, name, color, icon, kind, sharing_type, fixed_ratio)
       VALUES (1, NULL, ?, '#aabbcc', 'circle', 'expense', ?, ?)`
    )
    .run(name, sharingType, fixedRatio);
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Monthly breakdown tests
// ---------------------------------------------------------------------------

describe("getBalance: monthly breakdown", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("one transaction per month for 3 months => 3 entries in months[]", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "Monthly3Cat");

    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-02-15", dedupHash: "mh1" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-03-15", dedupHash: "mh2" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-15", dedupHash: "mh3" });

    const result = getBalance(WS)!;
    expect(result.months).toHaveLength(3);
  });

  it("partnerAPaid sums correctly per month", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "PaidPerMonth");

    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-10", chargedAmount: -60, dedupHash: "pp1" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-20", chargedAmount: -40, dedupHash: "pp2" });

    const result = getBalance(WS)!;
    const aprilRow = result.months.find((m) => m.month === "2025-04");
    expect(aprilRow).toBeDefined();
    // partnerA paid 60 + 40 = 100 in April
    expect(aprilRow!.partnerAPaid).toBeCloseTo(100);
    expect(aprilRow!.partnerBPaid).toBeCloseTo(0);
  });

  it("sharedTotal is the sum of charged_amount magnitudes for fixed-type txs that month", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const fixedCatId = insertCategory(db, "SharedTotalCat", "fixed", 0.5);

    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: fixedCatId, date: "2025-04-10", chargedAmount: -80, dedupHash: "st1" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: fixedCatId, date: "2025-04-22", chargedAmount: -120, dedupHash: "st2" });

    const result = getBalance(WS)!;
    const aprilRow = result.months.find((m) => m.month === "2025-04");
    expect(aprilRow).toBeDefined();
    expect(aprilRow!.sharedTotal).toBeCloseTo(200);
  });

  it("netDelta is the sum of per-tx balance deltas that month", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "DeltaCat", "fixed", 0.5);

    // A paid 100 in April => delta = +50 toward A
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-15", chargedAmount: -100, dedupHash: "nd1" });

    const result = getBalance(WS)!;
    const aprilRow = result.months.find((m) => m.month === "2025-04");
    expect(aprilRow).toBeDefined();
    // The netDelta for the month should equal 50 (absolute value of balance shift)
    expect(Math.abs(aprilRow!.netDelta)).toBeCloseTo(50);
  });

  it("month label is formatted as 'Month YYYY' (e.g. 'April 2025')", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "LabelCat");

    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-15", dedupHash: "lbl1" });

    const result = getBalance(WS)!;
    const aprilRow = result.months.find((m) => m.month === "2025-04");
    expect(aprilRow).toBeDefined();
    expect(aprilRow!.label).toBe("April 2025");
  });

  it("months are sorted in ascending order (oldest first)", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "SortCat");

    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-04-15", dedupHash: "so1" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-02-10", dedupHash: "so2" });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, date: "2025-03-20", dedupHash: "so3" });

    const result = getBalance(WS)!;
    const months = result.months.map((m) => m.month);
    expect(months).toEqual([...months].sort());
  });
});
