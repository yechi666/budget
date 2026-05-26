import "server-only";

import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  listSettlements,
  createSettlement,
} from "@/server/db/queries/balance";
import { getPartnerById } from "@/server/db/queries/partners";

export async function GET(request: Request): Promise<Response> {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listSettlements(workspaceId));
}

export async function POST(request: Request): Promise<Response> {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // Validate amount
  const amount = raw.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a finite number greater than 0" }, { status: 400 });
  }

  // Validate date
  const date = raw.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
  }

  // Validate fromPartnerId
  const fromPartnerId = raw.fromPartnerId;
  if (typeof fromPartnerId !== "number" || !Number.isInteger(fromPartnerId)) {
    return NextResponse.json({ error: "fromPartnerId must be an integer" }, { status: 400 });
  }

  // Validate toPartnerId
  const toPartnerId = raw.toPartnerId;
  if (typeof toPartnerId !== "number" || !Number.isInteger(toPartnerId)) {
    return NextResponse.json({ error: "toPartnerId must be an integer" }, { status: 400 });
  }

  // Partners must differ
  if (fromPartnerId === toPartnerId) {
    return NextResponse.json({ error: "fromPartnerId and toPartnerId must differ" }, { status: 400 });
  }

  // Both partners must belong to this workspace
  const fromPartner = getPartnerById(workspaceId, fromPartnerId);
  if (!fromPartner) {
    return NextResponse.json({ error: "fromPartnerId does not belong to this workspace" }, { status: 400 });
  }

  const toPartner = getPartnerById(workspaceId, toPartnerId);
  if (!toPartner) {
    return NextResponse.json({ error: "toPartnerId does not belong to this workspace" }, { status: 400 });
  }

  // Optional note
  const rawNote = raw.note;
  const note: string | null =
    typeof rawNote === "string" ? rawNote : null;

  const settlement = createSettlement(workspaceId, {
    fromPartnerId,
    toPartnerId,
    amount,
    date,
    note,
  });

  return NextResponse.json(settlement, { status: 201 });
}
