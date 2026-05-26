import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb } from "./helpers/db";
import {
  updateCategorySharing,
  updateCategoryChildrenSharing,
} from "@/server/db/queries/categories";
import { getCategoryById, createParentCategory } from "@/server/db/queries/categories";

const WS = 1;

interface CategorySharingRow {
  sharing_type: string;
  fixed_ratio: number;
}

function insertCategory(
  db: Database.Database,
  opts: {
    workspaceId?: number;
    name: string;
    parentId?: number | null;
    sharingType?: string;
    fixedRatio?: number;
  }
): number {
  const result = db
    .prepare(
      `INSERT INTO categories
         (workspace_id, parent_id, name, color, icon, kind, sharing_type, fixed_ratio)
       VALUES (?, ?, ?, '#aabbcc', 'circle', 'expense', ?, ?)`
    )
    .run(
      opts.workspaceId ?? WS,
      opts.parentId ?? null,
      opts.name,
      opts.sharingType ?? "individual",
      opts.fixedRatio ?? 0.5
    );
  return Number(result.lastInsertRowid);
}

describe("updateCategorySharing", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("persists sharing_type and fixed_ratio and returns true", () => {
    const catId = insertCategory(db, { name: "TestCat", sharingType: "individual", fixedRatio: 0.5 });
    const ok = updateCategorySharing(WS, catId, "fixed", 0.3);
    expect(ok).toBe(true);
    const row = db
      .prepare("SELECT sharing_type, fixed_ratio FROM categories WHERE id = ?")
      .get(catId) as CategorySharingRow;
    expect(row.sharing_type).toBe("fixed");
    expect(row.fixed_ratio).toBeCloseTo(0.3);
  });

  it("returns false when category id does not exist in workspace", () => {
    const ok = updateCategorySharing(WS, 99999, "fixed", 0.5);
    expect(ok).toBe(false);
  });

  it("does not affect categories in another workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const catId = insertCategory(db, { workspaceId: 2, name: "OtherCat", sharingType: "individual" });
    // Update from WS 1 -- should not touch WS 2 row
    updateCategorySharing(WS, catId, "ratioed", 0.7);
    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(catId) as CategorySharingRow;
    expect(row.sharing_type).toBe("individual");
  });

  it("can update sharing_type to ratioed", () => {
    const catId = insertCategory(db, { name: "RatioedCat" });
    const ok = updateCategorySharing(WS, catId, "ratioed", 0.5);
    expect(ok).toBe(true);
    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(catId) as CategorySharingRow;
    expect(row.sharing_type).toBe("ratioed");
  });

  it("does not affect other categories in the same workspace", () => {
    const catId1 = insertCategory(db, { name: "CatOne" });
    const catId2 = insertCategory(db, { name: "CatTwo", sharingType: "individual" });
    updateCategorySharing(WS, catId1, "fixed", 0.4);
    const row2 = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(catId2) as CategorySharingRow;
    expect(row2.sharing_type).toBe("individual");
  });
});

describe("updateCategoryChildrenSharing", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("updates all children and returns the count", () => {
    const parentId = insertCategory(db, { name: "Parent" });
    const child1 = insertCategory(db, { name: "Child1", parentId });
    const child2 = insertCategory(db, { name: "Child2", parentId });
    const child3 = insertCategory(db, { name: "Child3", parentId });

    const count = updateCategoryChildrenSharing(WS, parentId, "fixed", 0.4);
    expect(count).toBe(3);

    for (const childId of [child1, child2, child3]) {
      const row = db
        .prepare("SELECT sharing_type, fixed_ratio FROM categories WHERE id = ?")
        .get(childId) as CategorySharingRow;
      expect(row.sharing_type).toBe("fixed");
      expect(row.fixed_ratio).toBeCloseTo(0.4);
    }
  });

  it("returns 0 when the parent has no children", () => {
    const parentId = insertCategory(db, { name: "LonelyParent" });
    const count = updateCategoryChildrenSharing(WS, parentId, "fixed", 0.5);
    expect(count).toBe(0);
  });

  it("does not affect the parent row itself", () => {
    const parentId = insertCategory(db, { name: "ParentCheck", sharingType: "individual" });
    insertCategory(db, { name: "ChildA", parentId });
    updateCategoryChildrenSharing(WS, parentId, "ratioed", 0.5);
    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(parentId) as CategorySharingRow;
    expect(row.sharing_type).toBe("individual");
  });

  it("does not affect children of a different parent", () => {
    const parentA = insertCategory(db, { name: "ParentA" });
    const parentB = insertCategory(db, { name: "ParentB" });
    const childOfB = insertCategory(db, { name: "ChildOfB", parentId: parentB, sharingType: "individual" });
    insertCategory(db, { name: "ChildOfA", parentId: parentA });

    updateCategoryChildrenSharing(WS, parentA, "fixed", 0.6);

    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(childOfB) as CategorySharingRow;
    expect(row.sharing_type).toBe("individual");
  });

  it("does not affect children in another workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const parentId = insertCategory(db, { workspaceId: 2, name: "ParentWS2" });
    const childId = insertCategory(db, { workspaceId: 2, name: "ChildWS2", parentId, sharingType: "individual" });

    const count = updateCategoryChildrenSharing(WS, parentId, "fixed", 0.5);
    expect(count).toBe(0);

    const row = db
      .prepare("SELECT sharing_type FROM categories WHERE id = ?")
      .get(childId) as CategorySharingRow;
    expect(row.sharing_type).toBe("individual");
  });
});

describe("createParentCategory includes sharing fields", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns sharingType individual and fixedRatio null from createParentCategory", () => {
    const cat = createParentCategory(WS, { name: "NewParent", kind: "expense" });
    expect((cat as unknown as { sharingType: string }).sharingType).toBe("individual");
    // Individual categories don't have a meaningful ratio; should be null.
    expect((cat as unknown as { fixedRatio: number | null }).fixedRatio).toBeNull();
  });
});

describe("getCategoryById includes sharing fields", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("reads back sharingType and fixedRatio from getCategoryById", () => {
    const catId = insertCategory(db, { name: "ReadBack", sharingType: "fixed", fixedRatio: 0.3 });
    const cat = getCategoryById(WS, catId);
    expect(cat).not.toBeNull();
    expect((cat as unknown as { sharingType: string }).sharingType).toBe("fixed");
    expect((cat as unknown as { fixedRatio: number }).fixedRatio).toBeCloseTo(0.3);
  });
});
