import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { queryTransactions } from "@/server/db/queries/transactions";

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

function insertPartner(db: Database.Database, workspaceId = WS, name = "PartnerA"): number {
  const result = db
    .prepare(`INSERT INTO partners (workspace_id, name) VALUES (?, ?)`)
    .run(workspaceId, name);
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

interface InsertCategoryOpts {
  workspaceId?: number;
  name: string;
  sharingType?: string;
}

function insertCategory(db: Database.Database, opts: InsertCategoryOpts): number {
  const result = db
    .prepare(
      `INSERT INTO categories
         (workspace_id, parent_id, name, color, icon, kind, sharing_type, fixed_ratio)
       VALUES (?, NULL, ?, '#aabbcc', 'circle', 'expense', ?, 0.5)`
    )
    .run(opts.workspaceId ?? WS, opts.name, opts.sharingType ?? "individual");
  return Number(result.lastInsertRowid);
}

let _dedupCounter = 0;

interface InsertTransactionOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId?: number | null;
  categoryId?: number | null;
  needsReview?: boolean;
  date?: string;
}

function insertTransaction(db: Database.Database, opts: InsertTransactionOpts): number {
  _dedupCounter++;
  const result = db
    .prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount,
          original_currency, charged_amount, description, type, status,
          provider, sync_run_id, dedup_hash, dedup_sequence, kind,
          needs_review, credential_id, category_id)
       VALUES (?, 'ACC1', ?, ?, 100, 'ILS', -100, 'TestMerchant', 'normal', 'completed',
               'test', ?, ?, 0, 'expense', ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.date ?? "2024-06-15",
      opts.date ?? "2024-06-15",
      opts.syncRunId,
      `hash_review_flag_${_dedupCounter}`,
      opts.needsReview ? 1 : 0,
      opts.credentialId ?? null,
      opts.categoryId ?? null
    );
  return Number(result.lastInsertRowid);
}

// --- tests ---

describe("queryTransactions -- inReviewQueue computed field", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupTestDb();
    _dedupCounter = 0;
  });

  afterEach(() => teardownTestDb(db));

  it("needs_review=1 transaction has inReviewQueue=true", () => {
    const catId = insertCategory(db, { name: "TestIndividualFlag", sharingType: "individual" });
    const partnerId = insertPartner(db, WS, "PartnerA");
    const credId = insertCredential(db, { workspaceId: WS, partnerId });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: true });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].inReviewQueue).toBe(true);
  });

  it("needs_review=0 + fixed category + unassigned credential yields inReviewQueue=true", () => {
    const catId = insertCategory(db, { name: "TestSharedFixed", sharingType: "fixed" });
    const credId = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: false });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].inReviewQueue).toBe(true);
  });

  it("needs_review=0 + individual category + unassigned credential yields inReviewQueue=false", () => {
    const catId = insertCategory(db, { name: "TestIndividualUnassigned", sharingType: "individual" });
    const credId = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: false });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].inReviewQueue).toBe(false);
  });

  it("needs_review=0 + fixed category + assigned credential yields inReviewQueue=false", () => {
    const catId = insertCategory(db, { name: "TestSharedAssigned", sharingType: "fixed" });
    const partnerId = insertPartner(db, WS, "PartnerB");
    const credId = insertCredential(db, { workspaceId: WS, partnerId, label: "Assigned" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: false });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions).toHaveLength(1);
    expect(transactions[0].inReviewQueue).toBe(false);
  });

  it("both triggers active (needs_review=1 + fixed category + unassigned credential) yields inReviewQueue=true", () => {
    const catId = insertCategory(db, { name: "TestBothTriggers", sharingType: "fixed" });
    const credId = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned2" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credId, categoryId: catId, needsReview: true });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions).toHaveLength(1);
    // Single boolean -- true regardless of which trigger fired
    expect(transactions[0].inReviewQueue).toBe(true);
  });

  it("inReviewQueue is defined (not undefined) on every returned row", () => {
    const catFixed = insertCategory(db, { name: "TestFixedMulti", sharingType: "fixed" });
    const catIndividual = insertCategory(db, { name: "TestIndividualMulti", sharingType: "individual" });
    const partnerId = insertPartner(db, WS, "PartnerC");
    const credAssigned = insertCredential(db, { workspaceId: WS, partnerId, label: "Assigned2" });
    const credUnassigned = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned3" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credAssigned, categoryId: catFixed, needsReview: false });
    insertTransaction(db, { syncRunId, credentialId: credUnassigned, categoryId: catFixed, needsReview: false });
    insertTransaction(db, { syncRunId, credentialId: credAssigned, categoryId: catIndividual, needsReview: true });
    insertTransaction(db, { syncRunId, credentialId: null, categoryId: null, needsReview: false });

    const { transactions } = queryTransactions(WS, {});
    expect(transactions.length).toBeGreaterThan(0);
    for (const txn of transactions) {
      expect(txn.inReviewQueue).toBeDefined();
      expect(typeof txn.inReviewQueue).toBe("boolean");
    }
  });
});
