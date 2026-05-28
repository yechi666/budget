import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { queryTransactions } from "@/server/db/queries/transactions";

const WS = 1;
const WS2 = 2;

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

let _dedupCounter = 0;

interface InsertTransactionOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId?: number | null;
  categoryId?: number | null;
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
               'test', ?, ?, 0, 'expense', 0, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.date ?? "2024-06-15",
      opts.date ?? "2024-06-15",
      opts.syncRunId,
      `hash_partner_filter_${_dedupCounter}`,
      opts.credentialId ?? null,
      opts.categoryId ?? null
    );
  return Number(result.lastInsertRowid);
}

// --- tests ---

describe("queryTransactions -- partnerId filter", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupTestDb();
    _dedupCounter = 0;
  });

  afterEach(() => teardownTestDb(db));

  it("returns only transactions belonging to partner A's credential when filtering by partnerA.id", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const syncRunId = insertSyncRun(db);

    const txA = insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credB });

    const { transactions, total } = queryTransactions(WS, { partnerId: partnerA });
    expect(total).toBe(1);
    expect(transactions[0].id).toBe(txA);
  });

  it("returns only transactions belonging to partner B's credential when filtering by partnerB.id", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    const txB = insertTransaction(db, { syncRunId, credentialId: credB });

    const { transactions, total } = queryTransactions(WS, { partnerId: partnerB });
    expect(total).toBe(1);
    expect(transactions[0].id).toBe(txB);
  });

  it("returns empty when partnerId does not match any credential", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, credentialId: credA });

    const unknownPartnerId = 999999;
    const { transactions, total } = queryTransactions(WS, { partnerId: unknownPartnerId });
    expect(total).toBe(0);
    expect(transactions).toHaveLength(0);
  });

  it("returns empty when partnerId and credentialIds do not intersect (A partner, B credential)", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credB });

    // partnerA's creds do not include credB: intersection is empty
    const { transactions, total } = queryTransactions(WS, {
      partnerId: partnerA,
      credentialIds: [credB],
    });
    expect(total).toBe(0);
    expect(transactions).toHaveLength(0);
  });

  it("returns A's transactions when partnerId and credentialIds both resolve to credential A", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const syncRunId = insertSyncRun(db);

    const txA = insertTransaction(db, { syncRunId, credentialId: credA });

    const { transactions, total } = queryTransactions(WS, {
      partnerId: partnerA,
      credentialIds: [credA],
    });
    expect(total).toBe(1);
    expect(transactions[0].id).toBe(txA);
  });

  it("does not bleed across workspaces: partnerA2 in ws2 returns empty when querying ws1", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();

    const partnerA1 = insertPartner(db, WS, "PartnerA1");
    const credA1 = insertCredential(db, { workspaceId: WS, partnerId: partnerA1 });
    const syncRun1 = insertSyncRun(db, WS);
    insertTransaction(db, { workspaceId: WS, syncRunId: syncRun1, credentialId: credA1 });

    const partnerA2 = insertPartner(db, WS2, "PartnerA2");
    const credA2 = insertCredential(db, { workspaceId: WS2, partnerId: partnerA2 });
    const syncRun2 = insertSyncRun(db, WS2);
    insertTransaction(db, { workspaceId: WS2, syncRunId: syncRun2, credentialId: credA2 });

    // Querying ws1 with ws2's partnerId should return nothing
    const { transactions, total } = queryTransactions(WS, { partnerId: partnerA2 });
    expect(total).toBe(0);
    expect(transactions).toHaveLength(0);
  });

  it("combines partnerId with from/to date range filters correctly", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA, date: "2024-01-01" });
    const txInRange = insertTransaction(db, { syncRunId, credentialId: credA, date: "2024-06-15" });
    insertTransaction(db, { syncRunId, credentialId: credA, date: "2024-12-31" });

    const { transactions, total } = queryTransactions(WS, {
      partnerId: partnerA,
      from: "2024-05-01",
      to: "2024-07-01",
    });
    expect(total).toBe(1);
    expect(transactions[0].id).toBe(txInRange);
  });

  it("transactions on an unassigned credential do not appear when filtering by either partner", () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const credN = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credB });
    // Transaction on unassigned credential
    insertTransaction(db, { syncRunId, credentialId: credN });

    const resultA = queryTransactions(WS, { partnerId: partnerA });
    expect(resultA.total).toBe(1);
    expect(resultA.transactions.every((t) => t.credentialId === credA)).toBe(true);

    const resultB = queryTransactions(WS, { partnerId: partnerB });
    expect(resultB.total).toBe(1);
    expect(resultB.transactions.every((t) => t.credentialId === credB)).toBe(true);
  });
});
