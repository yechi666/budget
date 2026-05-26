import { NextResponse } from "next/server";
import {
  deleteCategory,
  setCategoryParent,
  updateCategoryBudgetMode,
  updateCategoryDescription,
  updateCategorySharing,
  updateCategoryChildrenSharing,
} from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { SHARING_TYPES, type SharingType } from "@/lib/types";

const MAX_DESCRIPTION_LENGTH = 500;

function isValidSharingType(value: unknown): value is SharingType {
  return (
    typeof value === "string" &&
    SHARING_TYPES.includes(value as SharingType)
  );
}

function isValidFixedRatio(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

const SHARING_TYPES_DISPLAY = SHARING_TYPES.map((t) => `'${t}'`).join(", ");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const typed = body as {
    budgetMode?: unknown;
    description?: unknown;
    parentId?: unknown;
    sharingType?: unknown;
    fixedRatio?: unknown;
    propagateToChildren?: unknown;
  };

  let applied = false;

  if (typed.budgetMode !== undefined) {
    if (typed.budgetMode !== "budgeted" && typed.budgetMode !== "tracking") {
      return NextResponse.json(
        { error: "budgetMode must be 'budgeted' or 'tracking'" },
        { status: 400 }
      );
    }
    const ok = updateCategoryBudgetMode(workspaceId, categoryId, typed.budgetMode);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.description !== undefined) {
    if (typed.description !== null && typeof typed.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 }
      );
    }
    if (
      typeof typed.description === "string" &&
      typed.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: `description must be ${MAX_DESCRIPTION_LENGTH} chars or fewer` },
        { status: 400 }
      );
    }
    const ok = updateCategoryDescription(
      workspaceId,
      categoryId,
      typed.description as string | null
    );
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    applied = true;
  }

  if (typed.parentId !== undefined) {
    if (typed.parentId !== null && typeof typed.parentId !== "number") {
      return NextResponse.json(
        { error: "parentId must be a number or null" },
        { status: 400 }
      );
    }
    const result = setCategoryParent(
      workspaceId,
      categoryId,
      typed.parentId as number | null
    );
    if (!result.ok) {
      const status =
        result.reason === "not-found" || result.reason === "target-not-found"
          ? 404
          : 400;
      return NextResponse.json(
        { error: result.reason },
        { status }
      );
    }
    applied = true;
  }

  // fixedRatio on its own is meaningless: it always rides along with sharingType.
  if (typed.sharingType === undefined && typed.fixedRatio !== undefined) {
    return NextResponse.json(
      { error: "fixedRatio requires sharingType" },
      { status: 400 }
    );
  }

  if (typed.sharingType !== undefined) {
    if (!isValidSharingType(typed.sharingType)) {
      return NextResponse.json(
        { error: `sharingType must be one of: ${SHARING_TYPES_DISPLAY}` },
        { status: 400 }
      );
    }
    const sharingType = typed.sharingType;

    if (typed.fixedRatio !== undefined && !isValidFixedRatio(typed.fixedRatio)) {
      return NextResponse.json(
        { error: "fixedRatio must be a finite number in [0,1]" },
        { status: 400 }
      );
    }

    // For 'fixed', use the supplied ratio or default 0.5.
    // For 'individual' / 'ratioed', the ratio doesn't apply — the query
    // layer coerces to null regardless of what we pass.
    const fixedRatio =
      sharingType === "fixed"
        ? ((typed.fixedRatio as number | undefined) ?? 0.5)
        : null;

    const ok = updateCategorySharing(workspaceId, categoryId, sharingType, fixedRatio);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (typed.propagateToChildren === true) {
      updateCategoryChildrenSharing(workspaceId, categoryId, sharingType, fixedRatio);
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const result = deleteCategory(workspaceId, categoryId);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "has-children",
        message:
          "This category has subcategories. Delete each one before deleting this group.",
        children: result.children ?? [],
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedCategoryId: result.deletedCategoryId,
    unassignedTransactionCount: result.unassignedTransactionCount,
  });
}
