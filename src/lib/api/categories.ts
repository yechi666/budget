import type { Category, Budget, BudgetMode } from "@/lib/types";
import type { CategoryKindFilter } from "./transactions";
import { fetchJSON } from "./_core";

export interface CategoryChildBreakdown {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  spent: number;
  budget: number;
  budgetMode: BudgetMode;
  isAutoBudget: boolean;
  percentSpent: number;
}

export interface CategoryDetail {
  category: {
    id: number;
    parentId: number | null;
    name: string;
    color: string;
    icon: string | null;
    kind: "expense" | "income";
    budgetMode: BudgetMode;
    isParent: boolean;
  };
  spent: number;
  budget: number;
  isAutoBudget: boolean;
  budgetSource: "own" | "rollup" | "leaf";
  vsTypical: { typical: number; percentDiff: number } | null;
  remaining: number;
  percentSpent: number;
  transactionCount: number;
  avgPerTransaction: number;
  vsLastMonth: number | null;
  prevSpent: number;
  prevPeriodLabel: string;
  dailySpend: Array<{ date: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  transactions: import("@/lib/types").TransactionWithCategory[];
  needsReviewTransactions: import("@/lib/types").TransactionWithCategory[];
  needsReviewCount: number;
  period: { from: string; to: string };
  children: CategoryChildBreakdown[] | null;
}

export function getCategories(kind?: CategoryKindFilter) {
  const qs = kind ? `?kind=${kind}` : "";
  return fetchJSON<Category[]>(`/api/categories${qs}`);
}

export function getCategoryDetail(
  id: number,
  params: { from: string; to: string }
) {
  const sp = new URLSearchParams({ from: params.from, to: params.to });
  return fetchJSON<CategoryDetail>(`/api/categories/${id}/detail?${sp}`);
}

export function createCategory(input: {
  name: string;
  kind: CategoryKindFilter;
  isParent?: boolean;
  icon?: string;
  description?: string | null;
}) {
  return fetchJSON<Category>("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteCategory(categoryId: number) {
  return fetchJSON<{
    success: boolean;
    deletedCategoryId: number;
    unassignedTransactionCount: number;
  }>(`/api/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function updateCategoryBudgetMode(
  categoryId: number,
  mode: BudgetMode
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetMode: mode }),
  });
}

export function updateCategoryDescription(
  categoryId: number,
  description: string | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export function setCategoryParent(
  categoryId: number,
  parentId: number | null
) {
  return fetchJSON<{ success: boolean }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

export function setBudgetModesBulk(budgetedIds: number[]) {
  return fetchJSON<{ success: boolean }>("/api/categories/budget-modes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetedIds }),
  });
}

export function getBudgets() {
  return fetchJSON<Budget[]>("/api/budgets");
}

export function updateBudget(categoryId: number, amount: number | null) {
  return fetchJSON<{ success: boolean }>("/api/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, amount }),
  });
}
