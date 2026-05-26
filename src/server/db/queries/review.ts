import "server-only";

import { getDb } from "../index";
import type { ReviewItem, ReviewTrigger, TransactionWithCategory, SharingType } from "@/lib/types";

interface ReviewRow {
  id: number;
  workspaceId: number;
  date: string;
  processedDate: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  originalAmount: number;
  originalCurrency: string;
  description: string;
  memo: string | null;
  type: string;
  status: string;
  accountNumber: string;
  identifier: string | null;
  provider: string;
  installmentsTotal: number | null;
  installmentsNumber: number | null;
  dedupHash: string;
  dedupSequence: number;
  categoryId: number | null;
  categorySource: string | null;
  aiConfidence: number | null;
  kind: string;
  needsReview: number;
  excluded: number;
  sharingOverride: string | null;
  credentialId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  sharingType: string | null;
  fixedRatio: number | null;
  partnerId: number | null;
  syncRunId: number;
  createdAt: string;
  updatedAt: string;
  accountLabel: string | null;
}

// Unknown-payer trigger uses the EFFECTIVE sharing type: the per-transaction
// override (t.sharing_override) wins if set, else the category default
// (c.sharing_type). When the user picks "Mark as mine" on a flagged item,
// we set sharing_override = 'individual'; the row must drop out of the queue
// because its effective type is now 'individual', even though the category
// still has a shared type.
const REVIEW_WHERE = `
  WHERE t.workspace_id = ?
    AND (
      t.needs_review = 1
      OR (
        COALESCE(t.sharing_override, c.sharing_type) IS NOT NULL
        AND COALESCE(t.sharing_override, c.sharing_type) != 'individual'
        AND (bc.partner_id IS NULL OR t.credential_id IS NULL)
      )
    )
`;

const REVIEW_SELECT = `
  SELECT
    t.id, t.workspace_id AS workspaceId, t.date, t.processed_date AS processedDate,
    t.charged_amount AS chargedAmount, t.charged_currency AS chargedCurrency,
    t.original_amount AS originalAmount, t.original_currency AS originalCurrency,
    t.description, t.memo, t.type, t.status, t.account_number AS accountNumber,
    t.identifier, t.provider, t.installment_total AS installmentsTotal,
    t.installment_number AS installmentsNumber, t.dedup_hash AS dedupHash,
    t.dedup_sequence AS dedupSequence, t.category_id AS categoryId,
    t.category_source AS categorySource, t.ai_confidence AS aiConfidence,
    t.kind, t.needs_review AS needsReview, t.is_excluded AS excluded,
    t.sharing_override AS sharingOverride, t.credential_id AS credentialId,
    t.sync_run_id AS syncRunId, t.created_at AS createdAt, t.updated_at AS updatedAt,
    c.name AS categoryName, c.color AS categoryColor,
    c.sharing_type AS sharingType, c.fixed_ratio AS fixedRatio,
    bc.partner_id AS partnerId, bc.label AS accountLabel
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN bank_credentials bc ON t.credential_id = bc.id
`;

function mapReviewRow(row: ReviewRow): ReviewItem {
  const triggers: ReviewTrigger[] = [];

  if (row.needsReview === 1) {
    triggers.push("low-confidence");
  }

  const isShared = row.sharingType != null && row.sharingType !== "individual";
  const hasNoPartner = row.partnerId == null;
  if (isShared && hasNoPartner) {
    triggers.push("unknown-payer");
  }

  const suggestedSharingType: SharingType | null = triggers.includes("unknown-payer")
    ? "individual"
    : null;

  const transaction: TransactionWithCategory = {
    id: row.id,
    accountNumber: row.accountNumber,
    date: row.date,
    processedDate: row.processedDate,
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    chargedAmount: row.chargedAmount,
    chargedCurrency: row.chargedCurrency ?? null,
    description: row.description,
    memo: row.memo ?? null,
    type: row.type as "normal" | "installments",
    status: row.status as "completed" | "pending",
    identifier: row.identifier ?? null,
    installmentNumber: row.installmentsNumber ?? null,
    installmentTotal: row.installmentsTotal ?? null,
    categoryId: row.categoryId ?? null,
    categorySource: (row.categorySource ?? null) as "ai" | "user" | null,
    aiConfidence: row.aiConfidence ?? null,
    provider: row.provider,
    credentialId: row.credentialId ?? null,
    accountLabel: row.accountLabel ?? null,
    syncRunId: row.syncRunId,
    kind: row.kind as "expense" | "income" | "transfer",
    needsReview: row.needsReview === 1,
    isExcluded: row.excluded === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sharingOverride: (row.sharingOverride ?? null) as SharingType | null,
    categoryName: row.categoryName ?? null,
    categoryColor: row.categoryColor ?? null,
  };

  return {
    transaction,
    triggers,
    suggestedCategoryId: row.categoryId ?? null,
    suggestedSharingType,
  };
}

export function listReviewItems(workspaceId: number): ReviewItem[] {
  const rows = getDb()
    .prepare(`${REVIEW_SELECT} ${REVIEW_WHERE} ORDER BY t.date DESC, t.id DESC`)
    .all(workspaceId) as ReviewRow[];

  return rows.map(mapReviewRow);
}

export function getReviewCount(workspaceId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS count FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN bank_credentials bc ON t.credential_id = bc.id ${REVIEW_WHERE}`)
    .get(workspaceId) as { count: number };
  return row.count;
}
