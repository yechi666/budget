import "server-only";

import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getBalance } from "@/server/db/queries/balance";
import type { BalanceResponse } from "@/lib/types";

const EMPTY_BALANCE: BalanceResponse = {
  runningBalance: 0,
  owedByPartnerId: 0,
  owedToPartnerId: 0,
  months: [],
  settlements: [],
};

export async function GET(request: Request): Promise<Response> {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const balance = getBalance(workspaceId);
  return NextResponse.json(balance ?? EMPTY_BALANCE);
}
