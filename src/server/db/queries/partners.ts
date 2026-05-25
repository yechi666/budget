import "server-only";

import { getDb } from "../index";

export interface Partner {
  id: number;
  workspaceId: number;
  name: string;
  createdAt: string;
}

interface PartnerRow {
  id: number;
  workspace_id: number;
  name: string;
  created_at: string;
}

function mapRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function listPartners(workspaceId: number): Partner[] {
  const rows = getDb()
    .prepare(
      `SELECT id, workspace_id, name, created_at
       FROM partners WHERE workspace_id = ? ORDER BY id`
    )
    .all(workspaceId) as PartnerRow[];
  return rows.map(mapRow);
}

export function getPartnerById(
  workspaceId: number,
  partnerId: number
): Partner | null {
  const row = getDb()
    .prepare(
      `SELECT id, workspace_id, name, created_at
       FROM partners WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, partnerId) as PartnerRow | undefined;
  return row ? mapRow(row) : null;
}

export function createPartner(workspaceId: number, name: string): Partner {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Partner name is required");

  // Wrap count-check + INSERT in a transaction so concurrent requests cannot
  // both pass the cap check and both INSERT (TOCTOU race).
  const result = getDb().transaction(() => {
    const count = (
      getDb()
        .prepare("SELECT COUNT(*) as c FROM partners WHERE workspace_id = ?")
        .get(workspaceId) as { c: number }
    ).c;
    if (count >= 2) throw new Error("A workspace can have at most 2 partners");

    return getDb()
      .prepare(
        `INSERT INTO partners (workspace_id, name) VALUES (?, ?)
         RETURNING id, workspace_id, name, created_at`
      )
      .get(workspaceId, trimmed) as PartnerRow;
  })();

  return mapRow(result);
}

export function renamePartner(
  workspaceId: number,
  partnerId: number,
  name: string
): Partner | null {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Partner name is required");

  const result = getDb()
    .prepare(
      `UPDATE partners SET name = ?
       WHERE workspace_id = ? AND id = ?
       RETURNING id, workspace_id, name, created_at`
    )
    .get(trimmed, workspaceId, partnerId) as PartnerRow | undefined;
  return result ? mapRow(result) : null;
}

/**
 * Assign or clear the partner for a credential.
 * Returns true if the credential was found and updated, false if it did not
 * exist in this workspace (e.g. deleted in a race).
 */
export function setCredentialPartner(
  workspaceId: number,
  credentialId: number,
  partnerId: number | null
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE bank_credentials
       SET partner_id = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(partnerId, workspaceId, credentialId);
  return result.changes > 0;
}

export function listCredentialsWithPartner(workspaceId: number): Array<{
  id: number;
  label: string;
  provider: string;
  partnerId: number | null;
}> {
  const rows = getDb()
    .prepare(
      `SELECT id, label, provider, partner_id
       FROM bank_credentials WHERE workspace_id = ? ORDER BY provider, label`
    )
    .all(workspaceId) as Array<{
    id: number;
    label: string;
    provider: string;
    partner_id: number | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    provider: r.provider,
    partnerId: r.partner_id,
  }));
}
