import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb, insertCredential } from "./helpers/db";
import {
  getBalance,
  listSettlements,
  createSettlement,
  deleteSettlement,
} from "@/server/db/queries/balance";
import { createPartner } from "@/server/db/queries/partners";

const WS = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertSyncRun(db: Database.Database, workspaceId = WS): number {
  const result = db
    .prepare(
      `INSERT INTO sync_runs
         (workspace_id, provider, started_at, status, scrape_from_date, transactions_added, transactions_updated)
       VALUES (?, 'test', datetime('now'), 'completed', '2024-01-01', 0, 0)`
    )
    .run(workspaceId);
  return Number(result.lastInsertRowid);
}

interface InsertTxnOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId: number;
  categoryId?: number | null;
  chargedAmount?: number;
  date?: string;
  kind?: string;
  excluded?: boolean;
  sharingOverride?: string | null;
  dedupHash?: string;
}

function insertTransaction(db: Database.Database, opts: InsertTxnOpts): number {
  const result = db
    .prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount,
          original_currency, charged_amount, description, type, status,
          provider, sync_run_id, dedup_hash, dedup_sequence, kind,
          is_excluded, credential_id, category_id, sharing_override)
       VALUES (?, 'ACC1', ?, ?, 100, 'ILS', ?,
               'TestMerchant', 'normal', 'completed', 'test', ?, ?, 0, ?,
               ?, ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.date ?? "2025-04-15",
      opts.date ?? "2025-04-15",
      opts.chargedAmount ?? -100,
      opts.syncRunId,
      opts.dedupHash ?? `hash_${Date.now()}_${Math.random()}`,
      opts.kind ?? "expense",
      opts.excluded ? 1 : 0,
      opts.credentialId,
      opts.categoryId ?? null,
      opts.sharingOverride ?? null
    );
  return Number(result.lastInsertRowid);
}

interface InsertCategoryOpts {
  workspaceId?: number;
  name: string;
  sharingType?: string;
  fixedRatio?: number;
}

function insertCategory(db: Database.Database, opts: InsertCategoryOpts): number {
  const result = db
    .prepare(
      `INSERT INTO categories
         (workspace_id, parent_id, name, color, icon, kind, sharing_type, fixed_ratio)
       VALUES (?, NULL, ?, '#aabbcc', 'circle', 'expense', ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.name,
      opts.sharingType ?? "individual",
      opts.fixedRatio ?? 0.5
    );
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// getBalance -- partner count edge cases
// ---------------------------------------------------------------------------

describe("getBalance with 0 partners", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns null when workspace has no partners", () => {
    expect(getBalance(WS)).toBeNull();
  });
});

describe("getBalance with 1 partner", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns null when workspace has exactly 1 partner", () => {
    createPartner(WS, "Yechi");
    expect(getBalance(WS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getBalance with 2 partners and no transactions
// ---------------------------------------------------------------------------

describe("getBalance with 2 partners, no transactions", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns runningBalance=0, empty months, empty settlements", () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const result = getBalance(WS);
    expect(result).not.toBeNull();
    expect(result!.runningBalance).toBe(0);
    expect(result!.months).toEqual([]);
    expect(result!.settlements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Balance computation from fixed-type transactions
// ---------------------------------------------------------------------------

describe("getBalance: fixed-type transaction math", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("100 ILS fixed expense paid by partner A => runningBalance=50, owedTo=A", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "GroceriesTest", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(50);
    expect(result.owedToPartnerId).toBe(partnerA.id);
    expect(result.owedByPartnerId).toBe(partnerB.id);
  });

  it("100 ILS fixed expense paid by partner B => runningBalance=50, owedTo=B", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credB = insertCredential(db, { label: "Card B" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerB.id, credB);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Bills", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credB, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(50);
    expect(result.owedToPartnerId).toBe(partnerB.id);
    expect(result.owedByPartnerId).toBe(partnerA.id);
  });

  it("100 by A + 100 by B (same fixed category) => runningBalance=0", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    const credB = insertCredential(db, { label: "Card B" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerB.id, credB);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "GroceriesTest", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100, dedupHash: "h1" });
    insertTransaction(db, { syncRunId, credentialId: credB, categoryId: catId, chargedAmount: -100, dedupHash: "h2" });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("100 by A + 200 by B => runningBalance=50, owedTo=B", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    const credB = insertCredential(db, { label: "Card B" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerB.id, credB);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "GroceriesTest", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100, dedupHash: "h1" });
    insertTransaction(db, { syncRunId, credentialId: credB, categoryId: catId, chargedAmount: -200, dedupHash: "h2" });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(50);
    expect(result.owedToPartnerId).toBe(partnerB.id);
    expect(result.owedByPartnerId).toBe(partnerA.id);
  });
});

// ---------------------------------------------------------------------------
// Effective sharing type resolution
// ---------------------------------------------------------------------------

describe("getBalance: sharing type resolution", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("individual-type category expense contributes 0 to balance", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Personal", sharingType: "individual", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("ratioed-type category expense contributes 0 to balance (no-op until Feature 6)", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Ratioed", sharingType: "ratioed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("sharing_override='individual' on fixed-category tx => contributes 0", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Groceries2", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, {
      syncRunId, credentialId: credA, categoryId: catId,
      chargedAmount: -100, sharingOverride: "individual"
    });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("sharing_override='fixed' on individual-category tx => contributes per fixed_ratio", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    // Category is individual, but transaction overrides to fixed; ratio=0.5
    const catId = insertCategory(db, { name: "Personal2", sharingType: "individual", fixedRatio: 0.5 });
    insertTransaction(db, {
      syncRunId, credentialId: credA, categoryId: catId,
      chargedAmount: -100, sharingOverride: "fixed"
    });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(50);
    expect(result.owedToPartnerId).toBe(partnerA.id);
    expect(result.owedByPartnerId).toBe(partnerB.id);
  });

  it("custom fixed_ratio=0.3: 100 paid by A => runningBalance=30", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Ratio30", sharingType: "fixed", fixedRatio: 0.3 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(30);
  });
});

// ---------------------------------------------------------------------------
// Transactions that must be excluded from balance
// ---------------------------------------------------------------------------

describe("getBalance: excluded transactions", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("excluded=1 transaction is ignored", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "ExclCat", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, {
      syncRunId, credentialId: credA, categoryId: catId,
      chargedAmount: -100, excluded: true
    });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("kind=income transaction is ignored", () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "IncomeCat", sharingType: "fixed", fixedRatio: 0.5 });
    // Income transactions have positive charged_amount
    insertTransaction(db, {
      syncRunId, credentialId: credA, categoryId: catId,
      chargedAmount: 100, kind: "income"
    });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("credential.partner_id IS NULL => transaction is ignored", () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    // Credential has no partner assigned
    const credUnassigned = insertCredential(db, { label: "Unassigned" });
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "NoPtnrCat", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credUnassigned, categoryId: catId, chargedAmount: -100 });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

describe("getBalance: settlement math", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("settlement of exact amount => runningBalance=0", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Sett1Cat", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });
    // B owes A 50; B pays A 50
    createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
  });

  it("stacked settlements reduce balance correctly", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "Sett2Cat", sharingType: "fixed", fixedRatio: 0.5 });
    // A paid 200 => B owes A 100
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -200 });
    createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 30, date: "2025-04-20" });
    createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 40, date: "2025-04-21" });

    const result = getBalance(WS)!;
    // 100 - 30 - 40 = 30
    expect(result.runningBalance).toBeCloseTo(30);
  });
});

describe("deleteSettlement", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns true and balance is restored after delete", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, { name: "DelCat", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });
    const settlement = createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" });

    const ok = deleteSettlement(WS, settlement.id);
    expect(ok).toBe(true);

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(50);
  });

  it("returns false when settlement id does not exist", () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    expect(deleteSettlement(WS, 99999)).toBe(false);
  });

  it("returns false when settlement belongs to a different workspace (workspace isolation)", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const settlement = createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" });

    // Attempt to delete from WS=2 -- must not affect WS=1
    const ok = deleteSettlement(2, settlement.id);
    expect(ok).toBe(false);

    // Settlement must still exist in WS=1
    expect(listSettlements(WS)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Workspace isolation for getBalance
// ---------------------------------------------------------------------------

describe("getBalance: workspace isolation", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("transactions and settlements in ws=2 do not affect ws=1 balance", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();

    // WS=1 setup: no transactions
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");

    // WS=2 setup: lots of transactions
    const partnerA2 = createPartner(2, "Alice");
    const partnerB2 = createPartner(2, "Bob");
    const credA2 = insertCredential(db, { workspaceId: 2, label: "Card WS2" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA2.id, credA2);
    const syncRun2 = insertSyncRun(db, 2);
    const catId2 = insertCategory(db, { workspaceId: 2, name: "WS2 Cat", sharingType: "fixed", fixedRatio: 0.5 });
    insertTransaction(db, { workspaceId: 2, syncRunId: syncRun2, credentialId: credA2, categoryId: catId2, chargedAmount: -500 });
    createSettlement(2, { fromPartnerId: partnerB2.id, toPartnerId: partnerA2.id, amount: 10, date: "2025-04-20" });

    const result = getBalance(WS)!;
    expect(result.runningBalance).toBeCloseTo(0);
    expect(result.months).toEqual([]);
    expect(result.settlements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listSettlements ordering + createSettlement return shape
// ---------------------------------------------------------------------------

describe("listSettlements", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns settlements ordered by date DESC, id DESC", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const s1 = createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 10, date: "2025-03-01" });
    const s2 = createSettlement(WS, { fromPartnerId: partnerA.id, toPartnerId: partnerB.id, amount: 20, date: "2025-04-15" });
    const s3 = createSettlement(WS, { fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 30, date: "2025-04-15" });

    const settlements = listSettlements(WS);
    // Same date: later-inserted id should come first
    expect(settlements[0].id).toBe(s3.id);
    expect(settlements[1].id).toBe(s2.id);
    expect(settlements[2].id).toBe(s1.id);
  });
});

describe("createSettlement", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns a Settlement with all fields populated", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const s = createSettlement(WS, {
      fromPartnerId: partnerB.id,
      toPartnerId: partnerA.id,
      amount: 75,
      date: "2025-04-20",
      note: "April settlement",
    });

    expect(typeof s.id).toBe("number");
    expect(s.workspaceId).toBe(WS);
    expect(s.fromPartnerId).toBe(partnerB.id);
    expect(s.toPartnerId).toBe(partnerA.id);
    expect(s.amount).toBeCloseTo(75);
    expect(s.date).toBe("2025-04-20");
    expect(s.note).toBe("April settlement");
    expect(typeof s.createdAt).toBe("string");
  });

  it("note is null when not provided", () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");
    const s = createSettlement(WS, {
      fromPartnerId: partnerB.id,
      toPartnerId: partnerA.id,
      amount: 10,
      date: "2025-04-20",
    });
    expect(s.note).toBeNull();
  });
});
