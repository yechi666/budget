import type { TransactionWithCategory, SharingType } from "@/lib/types";
import { fetchJSON } from "./_core";

export type TransactionKindFilter = "expense" | "income" | "all";
export type TransactionKind = "expense" | "income" | "transfer";
export type CategoryKindFilter = "expense" | "income";

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(params: {
  from: string;
  to: string;
  credentialIds?: number[];
}) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  if (params.credentialIds?.length) {
    for (const id of params.credentialIds) {
      sp.append("credentialIds", String(id));
    }
  }
  return fetchJSON<TransactionsSummary>(`/api/transactions/summary?${sp}`);
}

export function getTransactions(params: {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  credentialIds?: number[];
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (
      (key === "categoryIds" || key === "credentialIds") &&
      Array.isArray(value)
    ) {
      for (const id of value) searchParams.append(key, String(id));
      return;
    }
    searchParams.set(key, String(value));
  });
  return fetchJSON<{ transactions: TransactionWithCategory[]; total: number }>(
    `/api/transactions?${searchParams}`
  );
}

export function setTransactionKind(id: number, kind: TransactionKind) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
}

export function approveTransactionCategory(id: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve: true }),
  });
}

export function setTransactionSharingOverride(
  id: number,
  override: SharingType | null
) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharingOverride: override }),
  });
}

export function updateTransactionCategory(id: number, categoryId: number) {
  return fetchJSON<{ success: boolean }>(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
}

export interface DeleteTransactionsResult {
  success: boolean;
  deleted: { txCount: number; syncCount: number; memoryCount: number };
}

export function deleteAllTransactions() {
  return fetchJSON<DeleteTransactionsResult>("/api/data/transactions", {
    method: "DELETE",
  });
}
