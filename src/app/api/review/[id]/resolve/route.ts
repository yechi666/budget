import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  setTransactionNeedsReview,
  setTransactionSharingOverride,
  updateTransactionCategory,
  getTransactionContext,
} from "@/server/db/queries/transactions";
import { getCategoryById, getAllCategories } from "@/server/db/queries/categories";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { recordCorrection } from "@/server/db/queries/category-corrections";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }

  const action = (body as Record<string, unknown>).action;

  switch (action) {
    case "confirm": {
      const ctx = getTransactionContext(workspaceId, numericId);
      if (!ctx) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      // Per spec: confirming a category sets needs_review = 0 AND
      // category_source = 'user'. Only do the category bump if the tx
      // already has a category; otherwise just clear the flag.
      if (ctx.categoryId != null) {
        updateTransactionCategory(workspaceId, numericId, ctx.categoryId, "user");
      }
      setTransactionNeedsReview(workspaceId, numericId, false);
      return NextResponse.json({ success: true });
    }

    case "set-category": {
      const categoryId = (body as Record<string, unknown>).categoryId;
      if (typeof categoryId !== "number" || !Number.isInteger(categoryId) || categoryId <= 0) {
        return NextResponse.json({ error: "categoryId must be a positive integer" }, { status: 400 });
      }

      const ctx = getTransactionContext(workspaceId, numericId);
      if (!ctx) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }

      const category = getCategoryById(workspaceId, categoryId);
      if (!category) {
        return NextResponse.json({ error: "category not found" }, { status: 404 });
      }

      updateTransactionCategory(workspaceId, numericId, categoryId, "user");
      setTransactionNeedsReview(workspaceId, numericId, false);

      if (ctx.kind === "expense" || ctx.kind === "income") {
        const allCategories = getAllCategories(workspaceId);
        const cat = allCategories.find((c) => c.id === categoryId);
        if (cat && (cat.kind === "expense" || cat.kind === "income")) {
          recordMerchantCategory(
            workspaceId,
            ctx.description,
            categoryId,
            cat.kind,
            "user"
          );

          if (
            ctx.categorySource === "ai" &&
            ctx.categoryId != null &&
            ctx.categoryId !== categoryId
          ) {
            recordCorrection(
              workspaceId,
              ctx.description,
              ctx.categoryId,
              categoryId,
              cat.kind
            );
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    case "mark-individual": {
      const ok = setTransactionSharingOverride(workspaceId, numericId, "individual");
      if (!ok) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    default: {
      return NextResponse.json(
        { error: `unknown action: ${String(action)}` },
        { status: 400 }
      );
    }
  }
}
