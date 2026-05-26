import "server-only";

import { getDb } from "../index";
import { listPartners } from "./partners";
import type {
  BalanceResponse,
  MonthlyBalanceRow,
  Settlement,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface SettlementRow {
  id: number;
  workspace_id: number;
  from_partner_id: number;
  to_partner_id: number;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

interface TxRow {
  id: number;
  charged_amount: number;
  date: string;
  sharing_override: string | null;
  sharing_type: string | null;
  fixed_ratio: number | null;
  payer_partner_id: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapSettlementRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fromPartnerId: row.from_partner_id,
    toPartnerId: row.to_partner_id,
    amount: row.amount,
    date: row.date,
    note: row.note,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// listSettlements
// ---------------------------------------------------------------------------

export function listSettlements(workspaceId: number): Settlement[] {
  const rows = getDb()
    .prepare(
      `SELECT id, workspace_id, from_partner_id, to_partner_id,
              amount, date, note, created_at
       FROM settlements
       WHERE workspace_id = ?
       ORDER BY date DESC, id DESC`
    )
    .all(workspaceId) as SettlementRow[];
  return rows.map(mapSettlementRow);
}

// ---------------------------------------------------------------------------
// createSettlement
// ---------------------------------------------------------------------------

export function createSettlement(
  workspaceId: number,
  input: {
    fromPartnerId: number;
    toPartnerId: number;
    amount: number;
    date: string;
    note?: string | null;
  }
): Settlement {
  if (input.fromPartnerId === input.toPartnerId) {
    throw new Error("fromPartnerId and toPartnerId must differ");
  }

  const row = getDb()
    .prepare(
      `INSERT INTO settlements
         (workspace_id, from_partner_id, to_partner_id, amount, date, note)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, workspace_id, from_partner_id, to_partner_id,
                 amount, date, note, created_at`
    )
    .get(
      workspaceId,
      input.fromPartnerId,
      input.toPartnerId,
      input.amount,
      input.date,
      input.note ?? null
    ) as SettlementRow;

  return mapSettlementRow(row);
}

// ---------------------------------------------------------------------------
// deleteSettlement
// ---------------------------------------------------------------------------

export function deleteSettlement(workspaceId: number, id: number): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM settlements WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

export function getBalance(workspaceId: number): BalanceResponse | null {
  const partners = listPartners(workspaceId);
  if (partners.length < 2) return null;

  const partnerA = partners[0];
  const partnerB = partners[1];

  const txRows = getDb()
    .prepare(
      `SELECT t.id, t.charged_amount, t.date,
              t.sharing_override,
              c.sharing_type, c.fixed_ratio,
              bc.partner_id AS payer_partner_id
       FROM transactions t
       JOIN bank_credentials bc ON t.credential_id = bc.id
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ?
         AND t.kind = 'expense'
         AND t.is_excluded = 0
         AND bc.partner_id IS NOT NULL`
    )
    .all(workspaceId) as TxRow[];

  // Build month buckets and compute running balance
  const monthMap = new Map<
    string,
    {
      sharedTotal: number;
      partnerAShare: number;
      partnerBShare: number;
      partnerAPaid: number;
      partnerBPaid: number;
      netDelta: number;
    }
  >();

  let rawBalance = 0;

  for (const row of txRows) {
    const effectiveType = row.sharing_override ?? row.sharing_type ?? "individual";

    // Only 'fixed' type contributes to balance; 'ratioed' is no-op until Feature 6
    if (effectiveType !== "fixed") continue;

    const absAmt = Math.abs(row.charged_amount);
    const ratio = row.fixed_ratio ?? 0.5;
    const delta = absAmt * ratio;

    const isPayerA = row.payer_partner_id === partnerA.id;

    if (isPayerA) {
      rawBalance += delta;
    } else {
      rawBalance -= delta;
    }

    // Monthly grouping
    const month = row.date.slice(0, 7);
    let bucket = monthMap.get(month);
    if (!bucket) {
      bucket = {
        sharedTotal: 0,
        partnerAShare: 0,
        partnerBShare: 0,
        partnerAPaid: 0,
        partnerBPaid: 0,
        netDelta: 0,
      };
      monthMap.set(month, bucket);
    }

    bucket.sharedTotal += absAmt;

    if (isPayerA) {
      bucket.partnerAPaid += absAmt;
      // A paid: A keeps payerShare=(1-ratio)*amt, B owes ratio*amt
      bucket.partnerAShare += absAmt * (1 - ratio);
      bucket.partnerBShare += absAmt * ratio;
      bucket.netDelta += delta;
    } else {
      bucket.partnerBPaid += absAmt;
      // B paid: B keeps payerShare=(1-ratio)*amt, A owes ratio*amt
      bucket.partnerBShare += absAmt * (1 - ratio);
      bucket.partnerAShare += absAmt * ratio;
      bucket.netDelta -= delta;
    }
  }

  // Apply settlements
  // A settlement "from X to Y" means X paid Y, reducing X's owed amount.
  // rawBalance > 0 means A is owed (B owes A). B paying A reduces rawBalance.
  // So if from=B (partnerB pays A), rawBalance decreases.
  // If from=A (partnerA pays B), rawBalance increases (A's credit grows less -- actually A is paying).
  // When from=partnerA: A is paying B, meaning B was owed something, so rawBalance was negative.
  // A paying reduces how negative rawBalance is: rawBalance += amount.
  // When from=partnerB: B is paying A, reducing rawBalance: rawBalance -= amount.
  const settlements = listSettlements(workspaceId);
  for (const settlement of settlements) {
    if (settlement.fromPartnerId === partnerA.id) {
      // A is paying B: reduces what B is owed (rawBalance was negative, becomes less negative)
      rawBalance += settlement.amount;
    } else {
      // B is paying A: reduces what A is owed (rawBalance was positive, becomes less positive)
      rawBalance -= settlement.amount;
    }
  }

  // Build months array sorted ascending
  const months: MonthlyBalanceRow[] = Array.from(monthMap.entries())
    .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
    .map(([month, bucket]) => ({
      month,
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(month + "-01T00:00:00Z")),
      sharedTotal: bucket.sharedTotal,
      partnerAShare: bucket.partnerAShare,
      partnerBShare: bucket.partnerBShare,
      partnerAPaid: bucket.partnerAPaid,
      partnerBPaid: bucket.partnerBPaid,
      netDelta: bucket.netDelta,
    }));

  const runningBalance = Math.abs(rawBalance);

  let owedToPartnerId: number;
  let owedByPartnerId: number;

  if (rawBalance >= 0) {
    owedToPartnerId = partnerA.id;
    owedByPartnerId = partnerB.id;
  } else {
    owedToPartnerId = partnerB.id;
    owedByPartnerId = partnerA.id;
  }

  return {
    runningBalance,
    owedByPartnerId,
    owedToPartnerId,
    months,
    settlements,
  };
}
