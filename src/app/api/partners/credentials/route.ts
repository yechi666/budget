import { NextResponse } from "next/server";
import { listCredentialsWithPartner } from "@/server/db/queries/partners";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listCredentialsWithPartner(workspaceId));
}
