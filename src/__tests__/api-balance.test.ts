import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb, insertCredential } from "./helpers/db";
import { GET as getBalance } from "@/app/api/balance/route";
import {
  GET as getSettlements,
  POST as postSettlement,
} from "@/app/api/balance/settlements/route";
import { DELETE as deleteSettlement } from "@/app/api/balance/settlements/[id]/route";
import { createPartner } from "@/server/db/queries/partners";
import type { Settlement, BalanceResponse } from "@/lib/types";

const WS = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(workspaceId = WS): Request {
  return new Request("http://localhost/api/balance", {
    method: "GET",
    headers: { "x-workspace-id": String(workspaceId) },
  });
}

function makePostRequest(body: unknown, workspaceId = WS): Request {
  return new Request("http://localhost/api/balance/settlements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": String(workspaceId),
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string | number, workspaceId = WS): Request {
  return new Request(`http://localhost/api/balance/settlements/${id}`, {
    method: "DELETE",
    headers: { "x-workspace-id": String(workspaceId) },
  });
}

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

function insertTransaction(
  db: Database.Database,
  opts: {
    syncRunId: number;
    credentialId: number;
    categoryId?: number | null;
    chargedAmount?: number;
    date?: string;
    dedupHash?: string;
  }
): void {
  db.prepare(
    `INSERT INTO transactions
       (workspace_id, account_number, date, processed_date, original_amount,
        original_currency, charged_amount, description, type, status,
        provider, sync_run_id, dedup_hash, dedup_sequence, kind,
        is_excluded, credential_id, category_id)
     VALUES (1, 'ACC1', ?, ?, 100, 'ILS', ?,
             'TestMerchant', 'normal', 'completed', 'test', ?, ?, 0, 'expense',
             0, ?, ?)`
  ).run(
    opts.date ?? "2025-04-15",
    opts.date ?? "2025-04-15",
    opts.chargedAmount ?? -100,
    opts.syncRunId,
    opts.dedupHash ?? `hash_${Date.now()}_${Math.random()}`,
    opts.credentialId,
    opts.categoryId ?? null
  );
}

// ---------------------------------------------------------------------------
// GET /api/balance
// ---------------------------------------------------------------------------

describe("GET /api/balance", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns 200 with zero-balance object when fewer than 2 partners", async () => {
    const response = await getBalance(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json() as BalanceResponse;
    expect(json.runningBalance).toBe(0);
    expect(json.months).toEqual([]);
    expect(json.settlements).toEqual([]);
  });

  it("returns 200 with computed balance when 2 partners and transactions exist", async () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const credA = insertCredential(db, { label: "Card A" });
    db.prepare("UPDATE bank_credentials SET partner_id = ? WHERE id = ?").run(partnerA.id, credA);
    const syncRunId = insertSyncRun(db);
    const catId = insertCategory(db, "GetBalanceCat");
    insertTransaction(db, { syncRunId, credentialId: credA, categoryId: catId, chargedAmount: -100 });

    const response = await getBalance(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json() as BalanceResponse;
    expect(json.runningBalance).toBeCloseTo(50);
    expect(json.owedToPartnerId).toBe(partnerA.id);
  });
});

// ---------------------------------------------------------------------------
// GET /api/balance/settlements
// ---------------------------------------------------------------------------

describe("GET /api/balance/settlements", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns 200 with an array of settlements", async () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");

    const response = await getSettlements(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json() as Settlement[];
    expect(Array.isArray(json)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/balance/settlements
// ---------------------------------------------------------------------------

describe("POST /api/balance/settlements", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("creates a settlement and returns 201 with Settlement object", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({
        fromPartnerId: partnerB.id,
        toPartnerId: partnerA.id,
        amount: 50,
        date: "2025-04-20",
        note: "Test payment",
      })
    );
    expect(response.status).toBe(201);
    const json = await response.json() as Settlement;
    expect(typeof json.id).toBe("number");
    expect(json.fromPartnerId).toBe(partnerB.id);
    expect(json.toPartnerId).toBe(partnerA.id);
    expect(json.amount).toBeCloseTo(50);
    expect(json.date).toBe("2025-04-20");
    expect(json.note).toBe("Test payment");
  });

  it("returns 400 when amount is 0", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 0, date: "2025-04-20" })
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("returns 400 when amount is negative", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: -5, date: "2025-04-20" })
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("returns 400 when date format is not YYYY-MM-DD", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 50, date: "2025/01/01" })
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("returns 400 when fromPartnerId belongs to a different workspace", async () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const partnerOther = createPartner(2, "Alice");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerOther.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" })
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("returns 400 when fromPartnerId equals toPartnerId", async () => {
    const partnerA = createPartner(WS, "Yechi");
    createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerA.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" })
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBeDefined();
  });

  it("absent note succeeds and returned note is null", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    const response = await postSettlement(
      makePostRequest({ fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 25, date: "2025-04-20" })
    );
    expect(response.status).toBe(201);
    const json = await response.json() as Settlement;
    expect(json.note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/balance/settlements/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/balance/settlements/:id", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns 204 when settlement exists and is deleted", async () => {
    const partnerA = createPartner(WS, "Yechi");
    const partnerB = createPartner(WS, "Reni");

    // Create a settlement via POST first
    const postResp = await postSettlement(
      makePostRequest({ fromPartnerId: partnerB.id, toPartnerId: partnerA.id, amount: 50, date: "2025-04-20" })
    );
    const settlement = await postResp.json() as Settlement;

    const response = await deleteSettlement(
      makeDeleteRequest(settlement.id),
      { params: Promise.resolve({ id: String(settlement.id) }) }
    );
    expect(response.status).toBe(204);
  });

  it("returns 404 when settlement does not exist", async () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");

    const response = await deleteSettlement(
      makeDeleteRequest(99999),
      { params: Promise.resolve({ id: "99999" }) }
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 when id is not a valid number", async () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");

    const response = await deleteSettlement(
      makeDeleteRequest("notanumber"),
      { params: Promise.resolve({ id: "notanumber" }) }
    );
    expect(response.status).toBe(400);
  });
});
