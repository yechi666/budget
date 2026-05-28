import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { GET } from "@/app/api/review/route";
import { POST } from "@/app/api/review/[id]/resolve/route";
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

interface InsertTransactionOpts {
  workspaceId?: number;
  syncRunId: number;
  credentialId?: number | null;
  categoryId?: number | null;
  needsReview?: boolean;
  date?: string;
}

let _counter = 0;

function insertTransaction(db: Database.Database, opts: InsertTransactionOpts): number {
  _counter++;
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
      `hash_api_review_${_counter}`,
      opts.needsReview ? 1 : 0,
      opts.credentialId ?? null,
      opts.categoryId ?? null
    );
  return Number(result.lastInsertRowid);
}

function makeGetRequest(workspaceId = WS, extraSearch = ""): Request {
  return new Request(`http://localhost/api/review${extraSearch}`, {
    method: "GET",
    headers: { "x-workspace-id": String(workspaceId) },
  });
}

function makePostRequest(id: number, body: unknown, workspaceId = WS): Request {
  return new Request(`http://localhost/api/review/${id}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": String(workspaceId),
    },
    body: JSON.stringify(body),
  });
}

interface NeedsReviewRow { needs_review: number }
interface CategoryRow { category_id: number | null; category_source: string | null }
interface SharingOverrideRow { sharing_override: string | null }
interface CountResult { count: number }

describe("GET /api/review", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns 200 and an array (empty when no flagged transactions)", async () => {
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json() as ReviewItem[];
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(0);
  });

  it("returns 200 and array of ReviewItems when flagged transactions exist", async () => {
    const catId = insertCategory(db, { name: "ReviewCat", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json() as ReviewItem[];
    expect(json).toHaveLength(1);
    expect(json[0].triggers).toContain("low-confidence");
    expect(json[0].transaction).toBeDefined();
  });

  it("returns 200 and { count } when ?count=1 is passed", async () => {
    const catId = insertCategory(db, { name: "ReviewCat2", sharingType: "individual" });
    const syncRunId = insertSyncRun(db);
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });
    insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const response = await GET(makeGetRequest(WS, "?count=1"));
    expect(response.status).toBe(200);
    const json = await response.json() as { count: number };
    expect(typeof json.count).toBe("number");
    expect(json.count).toBe(2);
  });

  it("scopes results to the workspace in x-workspace-id header", async () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();

    // WS 1: one flagged transaction
    const cat1 = insertCategory(db, { workspaceId: WS, name: "ReviewCat3" });
    const syncRun1 = insertSyncRun(db, WS);
    insertTransaction(db, { workspaceId: WS, syncRunId: syncRun1, categoryId: cat1, needsReview: true });

    // WS 2: two flagged transactions
    const cat2 = insertCategory(db, { workspaceId: 2, name: "ReviewCat4" });
    const syncRun2 = insertSyncRun(db, 2);
    insertTransaction(db, { workspaceId: 2, syncRunId: syncRun2, categoryId: cat2, needsReview: true });
    insertTransaction(db, { workspaceId: 2, syncRunId: syncRun2, categoryId: cat2, needsReview: true });

    const ws1Response = await GET(makeGetRequest(WS));
    const ws1Json = await ws1Response.json() as ReviewItem[];
    expect(ws1Json).toHaveLength(1);

    const ws2Response = await GET(makeGetRequest(2));
    const ws2Json = await ws2Response.json() as ReviewItem[];
    expect(ws2Json).toHaveLength(2);
  });
});

describe("POST /api/review/:id/resolve", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("action 'confirm' clears needs_review and returns 200 with success:true", async () => {
    const catId = insertCategory(db, { name: "ConfirmCat" });
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const response = await POST(
      makePostRequest(txnId, { action: "confirm" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);
    const json = await response.json() as { success: boolean };
    expect(json.success).toBe(true);

    const row = db
      .prepare("SELECT needs_review FROM transactions WHERE id = ?")
      .get(txnId) as NeedsReviewRow;
    expect(row.needs_review).toBe(0);
  });

  it("action 'set-category' updates category to source 'user', clears needs_review, returns 200", async () => {
    const catId = insertCategory(db, { name: "OldCat" });
    const newCatId = insertCategory(db, { name: "NewCat" });
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const response = await POST(
      makePostRequest(txnId, { action: "set-category", categoryId: newCatId }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT category_id, category_source FROM transactions WHERE id = ?")
      .get(txnId) as CategoryRow;
    expect(row.category_id).toBe(newCatId);
    expect(row.category_source).toBe("user");

    const reviewRow = db
      .prepare("SELECT needs_review FROM transactions WHERE id = ?")
      .get(txnId) as NeedsReviewRow;
    expect(reviewRow.needs_review).toBe(0);
  });

  it("action 'set-category' with categoryId from a different workspace returns 404 or 400", async () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const foreignCatId = insertCategory(db, { workspaceId: 2, name: "ForeignCat" });
    const catId = insertCategory(db, { name: "MyCat" });
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, categoryId: catId, needsReview: true });

    const response = await POST(
      makePostRequest(txnId, { action: "set-category", categoryId: foreignCatId }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect([400, 404]).toContain(response.status);
  });

  it("action 'mark-individual' sets sharing_override to 'individual' and returns 200", async () => {
    const catId = insertCategory(db, { name: "SharedCat", sharingType: "fixed" });
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, categoryId: catId, needsReview: false });

    const response = await POST(
      makePostRequest(txnId, { action: "mark-individual" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(row.sharing_override).toBe("individual");
  });

  it("unknown action returns 400", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, needsReview: true });

    const response = await POST(
      makePostRequest(txnId, { action: "unknown-garbage" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(400);
  });

  it("malformed JSON body returns 400", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, needsReview: true });

    const badRequest = new Request(`http://localhost/api/review/${txnId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": String(WS),
      },
      body: "not-valid-json{{{",
    });

    const response = await POST(
      badRequest,
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(400);
  });

  it("non-existent transaction id returns 404", async () => {
    const response = await POST(
      makePostRequest(999999, { action: "confirm" }),
      { params: Promise.resolve({ id: "999999" }) }
    );
    expect(response.status).toBe(404);
  });
});
