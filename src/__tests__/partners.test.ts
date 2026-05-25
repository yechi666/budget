import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { setupTestDb, teardownTestDb, insertCredential } from "./helpers/db";
import {
  listPartners,
  createPartner,
  renamePartner,
  setCredentialPartner,
  listCredentialsWithPartner,
  getPartnerById,
} from "@/server/db/queries/partners";

const WS = 1; // workspace id seeded by migration 013

describe("listPartners", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns an empty array for a new workspace", () => {
    expect(listPartners(WS)).toEqual([]);
  });

  it("returns partners in insertion order", () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    const names = listPartners(WS).map((p) => p.name);
    expect(names).toEqual(["Yechi", "Reni"]);
  });
});

describe("getPartnerById", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("returns the partner when found in the workspace", () => {
    const { id } = createPartner(WS, "Yechi");
    const p = getPartnerById(WS, id);
    expect(p?.name).toBe("Yechi");
  });

  it("returns null for a non-existent id", () => {
    expect(getPartnerById(WS, 9999)).toBeNull();
  });

  it("returns null when the partner belongs to a different workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const { id } = createPartner(WS, "Yechi");
    // Partner is in WS=1 but we query from WS=2 -- should not be visible
    expect(getPartnerById(2, id)).toBeNull();
  });
});

describe("createPartner", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("creates a partner and returns the row", () => {
    const partner = createPartner(WS, "Yechi");
    expect(partner).toMatchObject({ workspaceId: WS, name: "Yechi" });
    expect(typeof partner.id).toBe("number");
    expect(typeof partner.createdAt).toBe("string");
  });

  it("trims whitespace from the name", () => {
    const partner = createPartner(WS, "  Reni  ");
    expect(partner.name).toBe("Reni");
  });

  it("throws on an empty name", () => {
    expect(() => createPartner(WS, "   ")).toThrow("required");
  });

  it("throws on a duplicate name within the same workspace", () => {
    createPartner(WS, "Yechi");
    expect(() => createPartner(WS, "Yechi")).toThrow();
  });

  it("treats names as case-insensitive (COLLATE NOCASE) -- C8 fix", () => {
    createPartner(WS, "Alice");
    // 'alice' must be rejected as a duplicate of 'Alice'
    expect(() => createPartner(WS, "alice")).toThrow();
  });

  it("enforces the 2-partner cap atomically -- C3 fix", () => {
    createPartner(WS, "Yechi");
    createPartner(WS, "Reni");
    expect(() => createPartner(WS, "Third")).toThrow(/at most 2/);
  });

  it("allows the same name in a different workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    createPartner(WS, "Yechi");
    const p = createPartner(2, "Yechi");
    expect(p.workspaceId).toBe(2);
  });
});

describe("renamePartner", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("renames a partner and returns the updated row", () => {
    const { id } = createPartner(WS, "Yechi");
    const updated = renamePartner(WS, id, "Yechezkel");
    expect(updated?.name).toBe("Yechezkel");
    expect(updated?.id).toBe(id);
  });

  it("trims whitespace from the new name", () => {
    const { id } = createPartner(WS, "Yechi");
    const updated = renamePartner(WS, id, "  Reni  ");
    expect(updated?.name).toBe("Reni");
  });

  it("throws on an empty new name", () => {
    const { id } = createPartner(WS, "Yechi");
    expect(() => renamePartner(WS, id, "")).toThrow("required");
  });

  it("returns null when the partner id does not exist", () => {
    expect(renamePartner(WS, 9999, "Ghost")).toBeNull();
  });

  it("returns null when the workspace does not match", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const { id } = createPartner(WS, "Yechi");
    expect(renamePartner(2, id, "Hacker")).toBeNull();
  });
});

describe("setCredentialPartner + listCredentialsWithPartner", () => {
  let db: Database.Database;
  beforeEach(() => { db = setupTestDb(); });
  afterEach(() => teardownTestDb(db));

  it("credentials start with partnerId null", () => {
    insertCredential(db, { label: "My Card" });
    const creds = listCredentialsWithPartner(WS);
    expect(creds).toHaveLength(1);
    expect(creds[0].partnerId).toBeNull();
  });

  it("assigns a partner to a credential and returns true -- C4 fix", () => {
    const credId = insertCredential(db, { label: "My Card" });
    const { id: partnerId } = createPartner(WS, "Yechi");
    const ok = setCredentialPartner(WS, credId, partnerId);
    expect(ok).toBe(true);
    expect(listCredentialsWithPartner(WS)[0].partnerId).toBe(partnerId);
  });

  it("returns false when the credential does not exist -- C4 fix", () => {
    const ok = setCredentialPartner(WS, 9999, null);
    expect(ok).toBe(false);
  });

  it("returns false when the credential belongs to a different workspace -- C4 fix", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    const credId = insertCredential(db, { workspaceId: WS, label: "WS1 Card" });
    // Attempt to update from WS 2 -- must not affect WS 1
    const ok = setCredentialPartner(2, credId, null);
    expect(ok).toBe(false);
  });

  it("clears a partner assignment (back to null)", () => {
    const credId = insertCredential(db, { label: "My Card" });
    const { id: partnerId } = createPartner(WS, "Yechi");
    setCredentialPartner(WS, credId, partnerId);
    setCredentialPartner(WS, credId, null);
    expect(listCredentialsWithPartner(WS)[0].partnerId).toBeNull();
  });

  it("partner_id becomes null when the partner is deleted (ON DELETE SET NULL)", () => {
    const credId = insertCredential(db, { label: "My Card" });
    const { id: partnerId } = createPartner(WS, "Yechi");
    setCredentialPartner(WS, credId, partnerId);
    db.prepare("DELETE FROM partners WHERE id = ?").run(partnerId);
    expect(listCredentialsWithPartner(WS)[0].partnerId).toBeNull();
  });

  it("returns correct label and provider alongside partnerId", () => {
    insertCredential(db, { provider: "leumi", label: "Main Account" });
    const creds = listCredentialsWithPartner(WS);
    expect(creds[0]).toMatchObject({ label: "Main Account", provider: "leumi" });
  });

  it("only returns credentials for the requested workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (2, 'Other', 'other')").run();
    insertCredential(db, { workspaceId: WS, label: "WS1 Card" });
    insertCredential(db, { workspaceId: 2, provider: "leumi", label: "WS2 Card" });
    const creds = listCredentialsWithPartner(WS);
    expect(creds).toHaveLength(1);
    expect(creds[0].label).toBe("WS1 Card");
  });
});
