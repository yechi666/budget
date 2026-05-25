import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import { PATCH } from "@/app/api/categories/[id]/route";

const WS = 1;

interface CategorySharingRow {
  sharing_type: string;
  fixed_ratio: number;
  budget_mode: string;
}

function makeRequest(body: unknown, workspaceId = WS): Request {
  return new Request("http://localhost/api/categories/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-workspace-id": String(workspaceId),
    },
    body: JSON.stringify(body),
  });
}

function insertCategory(
  db: Database.Database,
  opts: {
    workspaceId?: number;
    name: string;
    parentId?: number | null;
    sharingType?: string;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO categories
         (workspace_id, parent_id, name, color, icon, kind, sharing_type, fixed_ratio)
       VALUES (?, ?, ?, '#aabbcc', 'circle', 'expense', ?, 0.5)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.parentId ?? null,
      opts.name,
      opts.sharingType ?? "individual"
    );
  return Number(result.lastInsertRowid);
}

describe("PATCH /api/categories/:id -- sharingType and fixedRatio", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("updates sharing_type and fixed_ratio, returns 200 with success:true", async () => {
    const catId = insertCategory(db, { name: "GroceriesTest" });
    const response = await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: 0.5 }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(200);
    const json = await response.json() as { success: boolean };
    expect(json.success).toBe(true);

    const row = db
      .prepare("SELECT sharing_type, fixed_ratio FROM categories WHERE id = ?")
      .get(catId) as CategorySharingRow;
    expect(row.sharing_type).toBe("fixed");
    expect(row.fixed_ratio).toBeCloseTo(0.5);
  });

  it("returns 400 for an invalid sharingType value", async () => {
    const catId = insertCategory(db, { name: "BadType" });
    const response = await PATCH(
      makeRequest({ sharingType: "weird" }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toMatch(/sharingType/i);
  });

  it("returns 400 for fixedRatio greater than 1", async () => {
    const catId = insertCategory(db, { name: "HighRatio" });
    const response = await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: 1.5 }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toMatch(/fixedRatio/i);
  });

  it("returns 400 for fixedRatio less than 0", async () => {
    const catId = insertCategory(db, { name: "NegRatio" });
    const response = await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: -0.1 }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toMatch(/fixedRatio/i);
  });

  it("returns 400 for a non-finite fixedRatio", async () => {
    const catId = insertCategory(db, { name: "InfRatio" });
    const response = await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: Infinity }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when category does not belong to the workspace", async () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const catId = insertCategory(db, { workspaceId: 2, name: "OtherCat" });
    const response = await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: 0.5 }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(404);
  });

  it("propagates to children when propagateToChildren: true", async () => {
    const parentId = insertCategory(db, { name: "PropParent" });
    const child1 = insertCategory(db, { name: "PropChild1", parentId });
    const child2 = insertCategory(db, { name: "PropChild2", parentId });

    const response = await PATCH(
      makeRequest({ sharingType: "ratioed", fixedRatio: 0.5, propagateToChildren: true }),
      { params: Promise.resolve({ id: String(parentId) }) }
    );
    expect(response.status).toBe(200);

    for (const childId of [child1, child2]) {
      const row = db
        .prepare("SELECT sharing_type FROM categories WHERE id = ?")
        .get(childId) as CategorySharingRow;
      expect(row.sharing_type).toBe("ratioed");
    }
  });

  it("does not propagate to children when propagateToChildren is absent", async () => {
    const parentId = insertCategory(db, { name: "NoPropParent" });
    const childId = insertCategory(db, { name: "NoPropChild", parentId, sharingType: "individual" });

    await PATCH(
      makeRequest({ sharingType: "fixed", fixedRatio: 0.5 }),
      { params: Promise.resolve({ id: String(parentId) }) }
    );

    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(childId) as CategorySharingRow;
    expect(row.sharing_type).toBe("individual");
  });

  it("existing budgetMode patch still works (regression)", async () => {
    const catId = insertCategory(db, { name: "BudgetReg" });
    const response = await PATCH(
      makeRequest({ budgetMode: "tracking" }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(200);
    const row = db
      .prepare("SELECT budget_mode FROM categories WHERE id = ?")
      .get(catId) as CategorySharingRow;
    expect(row.budget_mode).toBe("tracking");
  });

  it("returns 400 when body has no recognized fields", async () => {
    const catId = insertCategory(db, { name: "EmptyPatch" });
    const response = await PATCH(
      makeRequest({ unknownField: true }),
      { params: Promise.resolve({ id: String(catId) }) }
    );
    expect(response.status).toBe(400);
  });
});
