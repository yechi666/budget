import { NextResponse } from "next/server";
import {
  updateTransactionCategory,
  setTransactionKind,
  setTransactionNeedsReview,
  setTransactionSharingOverride,
  getTransactionContext,
} from "@/server/db/queries/transactions";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { recordCorrection } from "@/server/db/queries/category-corrections";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import type { SharingType } from "@/lib/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json()) as { categoryId: number };

  if (!body.categoryId) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  const numericId = Number(id);

  const before = getTransactionContext(workspaceId, numericId);
  updateTransactionCategory(workspaceId, numericId, body.categoryId, "user");
  setTransactionNeedsReview(workspaceId, numericId, false);

  if (before && (before.kind === "expense" || before.kind === "income")) {
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === body.categoryId
    );
    if (category && (category.kind === "expense" || category.kind === "income")) {
      recordMerchantCategory(
        workspaceId,
        before.description,
        body.categoryId,
        category.kind,
        "user"
      );

      // If the user just overrode an AI-set category, log it as a correction
      // so the categorizer learns not to repeat the mistake on similar merchants.
      if (
        before.categorySource === "ai" &&
        before.categoryId != null &&
        before.categoryId !== body.categoryId
      ) {
        recordCorrection(
          workspaceId,
          before.description,
          before.categoryId,
          body.categoryId,
          category.kind
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    approve?: unknown;
    sharingOverride?: unknown;
  };

  const numericId = Number(id);
  let applied = false;

  if (body.approve === true) {
    const ctx = getTransactionContext(workspaceId, numericId);
    if (!ctx) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    setTransactionNeedsReview(workspaceId, numericId, false);
    if (
      ctx.categoryId != null &&
      (ctx.kind === "expense" || ctx.kind === "income")
    ) {
      const category = getAllCategories(workspaceId).find(
        (c) => c.id === ctx.categoryId
      );
      if (
        category &&
        (category.kind === "expense" || category.kind === "income")
      ) {
        recordMerchantCategory(
          workspaceId,
          ctx.description,
          ctx.categoryId,
          category.kind,
          "approved-ai"
        );
      }
    }
    applied = true;
  }

  if (body.kind !== undefined) {
    if (
      body.kind !== "expense" &&
      body.kind !== "income" &&
      body.kind !== "transfer"
    ) {
      return NextResponse.json(
        { error: "kind must be 'expense', 'income', or 'transfer'" },
        { status: 400 }
      );
    }
    setTransactionKind(workspaceId, numericId, body.kind);
    applied = true;
  }

  if ("sharingOverride" in body) {
    const validOverrides: (SharingType | null)[] = ["individual", "fixed", "ratioed", null];
    if (!validOverrides.includes(body.sharingOverride as SharingType | null)) {
      return NextResponse.json(
        { error: "sharingOverride must be 'individual', 'fixed', 'ratioed', or null" },
        { status: 400 }
      );
    }
    const override = body.sharingOverride as SharingType | null;
    const ok = setTransactionSharingOverride(workspaceId, numericId, override);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (!applied) {
    return NextResponse.json(
      { error: "no recognized fields in body" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
