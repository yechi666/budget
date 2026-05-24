import { NextResponse } from "next/server";
import { listPartners, createPartner } from "@/server/db/queries/partners";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listPartners(workspaceId));
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

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
    const partner = createPartner(workspaceId, body.name);
    return NextResponse.json(partner, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create partner";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
