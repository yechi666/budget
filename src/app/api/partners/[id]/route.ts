import { NextResponse } from "next/server";
import { renamePartner, deletePartner } from "@/server/db/queries/partners";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const partnerId = Number(id);
  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const deleted = deletePartner(workspaceId, partnerId);
  if (!deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const partnerId = Number(id);
  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const partner = renamePartner(workspaceId, partnerId, body.name);
    if (!partner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(partner);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rename partner";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
