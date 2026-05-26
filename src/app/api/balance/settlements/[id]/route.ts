import "server-only";

import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { deleteSettlement } from "@/server/db/queries/balance";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id: idStr } = await params;

  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid settlement id" }, { status: 400 });
  }

  const deleted = deleteSettlement(workspaceId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
