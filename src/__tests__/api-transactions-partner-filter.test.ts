import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { GET } from "@/app/api/transactions/route";

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

let _dedupCounter = 0;

interface InsertTransactionOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId?: number | null;
  categoryId?: number | null;
  needsReview?: boolean;
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
       VALUES (?, 'ACC1', '2024-06-15', '2024-06-15', 100, 'ILS', -100, 'TestMerchant',
               'normal', 'completed', 'test', ?, ?, 0, 'expense', ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.syncRunId,
      `hash_api_partner_${_dedupCounter}`,
      opts.needsReview ? 1 : 0,
      opts.credentialId ?? null,
      opts.categoryId ?? null
    );
  return Number(result.lastInsertRowid);
}

function makeGetRequest(workspaceId = WS, search = ""): Request {
  return new Request(`http://localhost/api/transactions${search}`, {
    method: "GET",
    headers: { "x-workspace-id": String(workspaceId) },
  });
}

interface TransactionListResponse {
  transactions: {
    id: number;
    credentialId: number | null;
    inReviewQueue: boolean;
    [key: string]: unknown;
  }[];
  total: number;
}

// --- tests ---

describe("GET /api/transactions -- partnerId filter", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupTestDb();
    _dedupCounter = 0;
  });

  afterEach(() => teardownTestDb(db));

  it("returns only partner A's transactions when ?partnerId=<A.id>", async () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const syncRunId = insertSyncRun(db);

    const txA = insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credB });

    const response = await GET(makeGetRequest(WS, `?partnerId=${partnerA}`));
    expect(response.status).toBe(200);
    const json = await response.json() as TransactionListResponse;
    expect(json.total).toBe(1);
    expect(json.transactions[0].id).toBe(txA);
  });

  it("returns all transactions when no partnerId param is passed (regression)", async () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA });
    const credN = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credN });

    const response = await GET(makeGetRequest(WS));
    expect(response.status).toBe(200);
    const json = await response.json() as TransactionListResponse;
    expect(json.total).toBe(2);
  });

  it("ignores partnerId when the value is not a valid positive integer (NaN)", async () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA });
    const credN = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credN });

    // "invalid" is not a valid integer -- should be ignored
    const response = await GET(makeGetRequest(WS, "?partnerId=invalid"));
    expect(response.status).toBe(200);
    const json = await response.json() as TransactionListResponse;
    expect(json.total).toBe(2);
  });

  it("returns empty when partnerId=<A.id> and credentialIds=<B.id> (no intersection)", async () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const partnerB = insertPartner(db, WS, "PartnerB");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA, label: "A Card" });
    const credB = insertCredential(db, { workspaceId: WS, partnerId: partnerB, label: "B Card" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA });
    insertTransaction(db, { syncRunId, credentialId: credB });

    const response = await GET(makeGetRequest(WS, `?partnerId=${partnerA}&credentialIds=${credB}`));
    expect(response.status).toBe(200);
    const json = await response.json() as TransactionListResponse;
    expect(json.total).toBe(0);
    expect(json.transactions).toHaveLength(0);
  });

  it("response shape includes inReviewQueue boolean on each row", async () => {
    const partnerA = insertPartner(db, WS, "PartnerA");
    const credA = insertCredential(db, { workspaceId: WS, partnerId: partnerA });
    const credN = insertCredential(db, { workspaceId: WS, partnerId: null, label: "Unassigned" });
    const syncRunId = insertSyncRun(db);

    insertTransaction(db, { syncRunId, credentialId: credA, needsReview: true });
    insertTransaction(db, { syncRunId, credentialId: credN, needsReview: false });

    const response = await GET(makeGetRequest(WS));
    expect(response.status).toBe(200);
    const json = await response.json() as TransactionListResponse;
    expect(json.transactions.length).toBeGreaterThan(0);
    for (const txn of json.transactions) {
      expect(typeof txn.inReviewQueue).toBe("boolean");
    }
  });
});
