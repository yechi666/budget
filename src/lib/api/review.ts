import type { ReviewItem } from "@/lib/types";
import { fetchJSON } from "./_core";

export function getReviewItems() {
  return fetchJSON<ReviewItem[]>("/api/review");
}

export function getReviewCount() {
  return fetchJSON<{ count: number }>("/api/review?count=1");
}

export type ResolveAction =
  | { action: "confirm" }
  | { action: "set-category"; categoryId: number }
  | { action: "mark-individual" };

export function resolveReviewItem(id: number, body: ResolveAction) {
  return fetchJSON<{ success: boolean }>(`/api/review/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
