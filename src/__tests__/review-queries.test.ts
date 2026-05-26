import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { listReviewItems, getReviewCount } from "@/server/db/queries/review";
import type { ReviewItem } from "@/lib/types";

const WS = 1;

// --- fixture helpers ---

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

interface InsertCredentialOpts {
  workspaceId?: number;
  partnerId?: number | null;
  label?: string;
}

function insertCredential(db: Database.Database, opts: InsertCredentialOpts = {}): number {
  const fake = Buffer.from("fake");
  const result = db
    .prepare(
      `INSERT INTO bank_credentials
         (workspace_id, provider, label, credentials_encrypted, iv, auth_tag, partner_id)
       VALUES (?, 'isracard', ?, ?, ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.label ?? "Test Card",
      fake,
      fake,
      fake,
      opts.partnerId ?? null
    );
  return Number(result.lastInsertRowid);
}

interface InsertTransactionOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId?: number | null;
  categoryId?: number | null;
  chargedAmount?: number;
  needsReview?: boolean;
  date?: string;
  dedupHash?: string;
}

let _dedupCounter = 0;

function insertTransaction(db: Database.Database, opts: InsertTransactionOpts): number {
  _dedupCounter++;
  const result = db
    .prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount,
          original_currency, charged_amount, description, type, status,
          provider, sync_run_id, dedup_hash, dedup_sequence, kind,
          needs_review, credential_id, category_id)
       VALUES (?, 'ACC1', ?, ?, 100, 'ILS', ?, 'TestMerchant', 'normal', 'completed',
               'test', ?, ?, 0, 'expense', ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.date ?? "2024-06-15",
      opts.date ?? "2024-06-15",
      opts.chargedAmount ?? -100,
      opts.syncRunId,
      opts.dedupHash ?? `hash_review_${_dedupCounter}`,
      opts.needsReview ? 1 : 0,
      opts.credentialId ?? null,
      opts.categoryId ?? null
    );
  return Number(result.lastInsertRowid);
}

function insertPartner(db: Database.Database, workspaceId = WS, name = "PartnerA"): number {
  const result = db
    .prepare(
      `INSERT INTO partners (workspace_id, name) VALUES (?, ?)`
    )
    .run(workspaceId, name);
  return Number(result.lastInsertRowid);
}

// --- tests ---

describe("listReviewItems", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns empty array when there are no transactions", () => {
    const items = listReviewItems(WS);
    expect(items).toEqual([]);
  });

  it("includes a transaction with needs_review=1 and individual category with assigned credential as low-confidence", () => {
    const partnerId = insertPartner(db, WS, "PartnerA");
    const credId = insertCredential(db, { workspaceId: WS, partnerId });
    const catId = insertCategory(db, { name: "TestPersonal", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: true });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].triggers).toEqual(["low-confidence"]);
  });

  it("includes a transaction with fixed category and UNASSIGNED credential as unknown-payer", () => {
    const catId = insertCategory(db, { name: "TestShared", sharingType: "fixed" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].triggers).toEqual(["unknown-payer"]);
  });

  it("excludes a transaction with individual category and unassigned credential (no triggers)", () => {
    const catId = insertCategory(db, { name: "TestPersonal2", sharingType: "individual" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(0);
  });

  it("excludes a transaction with fixed category and assigned credential and needs_review=0", () => {
    const partnerId = insertPartner(db, WS, "PartnerB");
    const credId = insertCredential(db, { workspaceId: WS, partnerId });
    const catId = insertCategory(db, { name: "TestShared2", sharingType: "fixed" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: false });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(0);
  });

  it("includes both triggers when needs_review=1 AND fixed category with unassigned credential", () => {
    const catId = insertCategory(db, { name: "TestShared3", sharingType: "fixed" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: true });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].triggers).toContain("low-confidence");
    expect(items[0].triggers).toContain("unknown-payer");
    expect(items[0].triggers).toHaveLength(2);
  });

  it("sets suggestedCategoryId to the transaction's current categoryId", () => {
    const catId = insertCategory(db, { name: "TestPersonal3", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: null, categoryId: catId, needsReview: true });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].suggestedCategoryId).toBe(catId);
  });

  it("sets suggestedSharingType to 'individual' when unknown-payer trigger is present", () => {
    const catId = insertCategory(db, { name: "TestShared4", sharingType: "fixed" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].suggestedSharingType).toBe("individual");
  });

  it("sets suggestedSharingType to null when only low-confidence trigger is present", () => {
    const catId = insertCategory(db, { name: "TestPersonal4", sharingType: "individual" });
    const partnerId = insertPartner(db, WS, "PartnerC");
    const credId = insertCredential(db, { workspaceId: WS, partnerId });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: true });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    expect(items[0].suggestedSharingType).toBeNull();
  });

  it("getReviewCount matches listReviewItems.length", () => {
    const catId = insertCategory(db, { name: "TestShared5", sharingType: "fixed" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false, date: "2024-01-01" });
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false, date: "2024-01-02" });

    const items = listReviewItems(WS);
    const count = getReviewCount(WS);
    expect(count).toBe(items.length);
    expect(count).toBe(2);
  });

  it("isolates results by workspace: items in workspace 2 are not returned for workspace 1", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();

    // WS1: one flagged transaction
    const syncRun1 = insertSyncRun(db, WS);
    const cat1 = insertCategory(db, { workspaceId: WS, name: "TestPersonal5", sharingType: "individual" });
    insertTransaction(db, { workspaceId: WS, syncRunId: syncRun1, categoryId: cat1, needsReview: true });

    // WS2: one flagged transaction
    const syncRun2 = insertSyncRun(db, 2);
    const cat2 = insertCategory(db, { workspaceId: 2, name: "TestPersonal6", sharingType: "individual" });
    insertTransaction(db, { workspaceId: 2, syncRunId: syncRun2, categoryId: cat2, needsReview: true });

    const ws1Items = listReviewItems(WS);
    const ws2Items = listReviewItems(2);
    expect(ws1Items).toHaveLength(1);
    expect(ws2Items).toHaveLength(1);
    // Make sure each result belongs to the correct workspace
    const allWs1Ids = ws1Items.map((i) => i.transaction.id);
    const allWs2Ids = ws2Items.map((i) => i.transaction.id);
    expect(allWs1Ids.some((id) => allWs2Ids.includes(id))).toBe(false);
  });

  it("returns items ordered by date DESC then id DESC", () => {
    const catId = insertCategory(db, { name: "TestPersonal7", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);

    // Insert in arbitrary order, expect sorted result
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true, date: "2024-03-01" });
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true, date: "2024-01-01" });
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true, date: "2024-06-01" });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(3);
    const dates = items.map((i) => i.transaction.date);
    expect(dates[0]).toBe("2024-06-01");
    expect(dates[1]).toBe("2024-03-01");
    expect(dates[2]).toBe("2024-01-01");
  });

  it("populates TransactionWithCategory shape with categoryName and categoryColor when category exists", () => {
    const catId = insertCategory(db, { name: "TestPersonal8", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const items = listReviewItems(WS);
    expect(items).toHaveLength(1);
    const txn = items[0].transaction;
    expect(txn.categoryName).toBe("TestPersonal8");
    expect(txn.categoryColor).toBe("#aabbcc");
    expect(typeof txn.id).toBe("number");
    expect(typeof txn.chargedAmount).toBe("number");
    expect(typeof txn.description).toBe("string");
  });
});

describe("getReviewCount", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns 0 when no transactions are in the review queue", () => {
    expect(getReviewCount(WS)).toBe(0);
  });

  it("returns the number of review-queue transactions for the workspace", () => {
    const catId = insertCategory(db, { name: "TestShared6", sharingType: "fixed" });
    const unassignedCredId = insertCredential(db, { workspaceId: WS, partnerId: null });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: unassignedCredId, categoryId: catId, needsReview: false });
    expect(getReviewCount(WS)).toBe(1);
  });
});
