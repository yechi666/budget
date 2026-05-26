import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { listReviewItems, getReviewCount } from "@/server/db/queries/review";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const url = new URL(request.url);
  const countOnly = url.searchParams.get("count") === "1";

  if (countOnly) {
    const count = getReviewCount(workspaceId);
    return NextResponse.json({ count });
  }

  const items = listReviewItems(workspaceId);
  return NextResponse.json(items);
}
