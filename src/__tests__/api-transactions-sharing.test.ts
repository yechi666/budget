import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { PATCH } from "@/app/api/transactions/[id]/route";

const WS = 1;

interface SharingOverrideRow {
  sharing_override: string | null;
}

interface KindRow {
  kind: string;
}

interface NeedsReviewRow {
  needs_review: number;
}

function makePatchRequest(body: unknown, workspaceId = WS): Request {
  return new Request("http://localhost/api/transactions/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": String(workspaceId),
    },
    body: JSON.stringify(body),
  });
}

function insertSyncRun(db: Database.Database): number {
  const result = db
    .prepare(
      `INSERT INTO sync_runs
         (provider, started_at, status, scrape_from_date, transactions_added, transactions_updated)
       VALUES ('test', datetime('now'), 'completed', '2024-01-01', 0, 0)`
    )
    .run();
  return Number(result.lastInsertRowid);
}

function insertTransaction(
  db: Database.Database,
  opts: {
    workspaceId?: number;
    syncRunId: number;
    dedupHash?: string;
    kind?: string;
    needsReview?: boolean;
    sharingOverride?: string | null;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount,
          original_currency, charged_amount, description, type, status,
          provider, sync_run_id, dedup_hash, dedup_sequence, kind, needs_review, sharing_override)
       VALUES (?, 'ACC1', '2024-01-01', '2024-01-01', 100, 'ILS', -100,
               'TestMerchant', 'normal', 'completed', 'test', ?, ?, 0, ?, ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.syncRunId,
      opts.dedupHash ?? `hash_${Date.now()}_${Math.random()}`,
      opts.kind ?? "expense",
      opts.needsReview ? 1 : 0,
      opts.sharingOverride ?? null
    );
  return Number(result.lastInsertRowid);
}

describe("PATCH /api/transactions/:id -- sharingOverride", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("sets sharingOverride = fixed and returns 200", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId });

    const response = await PATCH(
      makePatchRequest({ sharingOverride: "fixed" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);
    const json = await response.json() as { success: boolean };
    expect(json.success).toBe(true);

    const row = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(row.sharing_override).toBe("fixed");
  });

  it("sets sharingOverride = ratioed and returns 200", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId });

    const response = await PATCH(
      makePatchRequest({ sharingOverride: "ratioed" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(row.sharing_override).toBe("ratioed");
  });

  it("sets sharingOverride = individual and returns 200", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, sharingOverride: "fixed" });

    const response = await PATCH(
      makePatchRequest({ sharingOverride: "individual" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(row.sharing_override).toBe("individual");
  });

  it("clears sharingOverride by sending null and returns 200", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, sharingOverride: "fixed" });

    const response = await PATCH(
      makePatchRequest({ sharingOverride: null }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(row.sharing_override).toBeNull();
  });

  it("returns 400 for an invalid sharingOverride value", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId });

    const response = await PATCH(
      makePatchRequest({ sharingOverride: "invalid" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("returns 400 when body has no recognized fields and no kind or approve", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId });

    const response = await PATCH(
      makePatchRequest({ unknownField: "whatever" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(400);
  });

  it("existing kind-only PATCH still works", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, kind: "expense" });

    const response = await PATCH(
      makePatchRequest({ kind: "income" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT kind FROM transactions WHERE id = ?")
      .get(txnId) as KindRow;
    expect(row.kind).toBe("income");
  });

  it("existing approve:true PATCH still works", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, needsReview: true });

    const response = await PATCH(
      makePatchRequest({ approve: true }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT needs_review FROM transactions WHERE id = ?")
      .get(txnId) as NeedsReviewRow;
    expect(row.needs_review).toBe(0);
  });

  it("invalid kind value returns 400", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId });

    const response = await PATCH(
      makePatchRequest({ kind: "bogus" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(400);
  });

  it("sharingOverride is independent of kind -- both can be in the same request", async () => {
    const syncRunId = insertSyncRun(db);
    const txnId = insertTransaction(db, { syncRunId, kind: "expense" });

    const response = await PATCH(
      makePatchRequest({ kind: "income", sharingOverride: "fixed" }),
      { params: Promise.resolve({ id: String(txnId) }) }
    );
    expect(response.status).toBe(200);

    const kindRow = db
      .prepare("SELECT kind FROM transactions WHERE id = ?")
      .get(txnId) as KindRow;
    expect(kindRow.kind).toBe("income");

    const overrideRow = db
      .prepare("SELECT sharing_override FROM transactions WHERE id = ?")
      .get(txnId) as SharingOverrideRow;
    expect(overrideRow.sharing_override).toBe("fixed");
  });
});
