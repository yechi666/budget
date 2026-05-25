import { fetchJSON, withWorkspaceHeader } from "./_core";
import type { CategoryKindFilter } from "./transactions";

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  speed?: number;
  etaSeconds?: number | null;
}

export interface PullEvent {
  type: "progress" | "complete" | "error";
  data: PullProgress & { message?: string };
}

export function listOllamaModels(url?: string) {
  const qs = url ? `?url=${encodeURIComponent(url)}` : "";
  return fetchJSON<{ models: string[]; error?: string }>(
    `/api/ai/ollama/models${qs}`
  );
}

export function pullOllamaModel(
  model: string,
  url: string | undefined,
  onEvent: (event: PullEvent) => void
): { cancel: () => void } {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        "/api/ai/ollama/pull",
        withWorkspaceHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, url }),
          signal: controller.signal,
        })
      );

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent as PullEvent["type"], data });
            } catch {
              // skip
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onEvent({
        type: "error",
        data: { status: "error", message: "Connection to pull endpoint lost" },
      });
    }
  })();

  return { cancel: () => controller.abort() };
}

export interface CategorizeAssignment {
  transactionId: number;
  description: string;
  categoryName: string;
  isNew: boolean;
  kind: CategoryKindFilter;
}

export interface CategorizeProposal {
  name: string;
  kind: CategoryKindFilter;
  transactionIds: number[];
  samples: string[];
}

export interface CategorizePreview {
  uncategorizedCount: number;
  assignments: CategorizeAssignment[];
  proposedCategories: CategorizeProposal[];
  existingCategoryUsage: Record<string, number>;
  errors?: string[];
}

export function previewCategorize() {
  return fetchJSON<CategorizePreview>("/api/categorize/preview", {
    method: "POST",
  });
}

export function applyCategorize(payload: {
  assignments: Array<{
    transactionId: number;
    categoryName: string;
    isNew: boolean;
    kind?: CategoryKindFilter;
  }>;
  approvedNewCategoryNames: string[];
  rejectionFallbacks?: Record<string, string>;
}) {
  return fetchJSON<{
    appliedCount: number;
    createdCategoriesCount: number;
    skippedCount: number;
  }>("/api/categorize/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
