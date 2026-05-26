import type { BalanceResponse, Settlement } from "@/lib/types";
import { fetchJSON, withWorkspaceHeader } from "./_core";

export function getBalance() {
  return fetchJSON<BalanceResponse>("/api/balance");
}

export function listSettlements() {
  return fetchJSON<Settlement[]>("/api/balance/settlements");
}

export function createSettlement(input: {
  fromPartnerId: number;
  toPartnerId: number;
  amount: number;
  date: string;
  note?: string | null;
}) {
  return fetchJSON<Settlement>("/api/balance/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteSettlement(id: number): Promise<void> {
  // Raw fetch (not fetchJSON) because the route returns 204 No Content,
  // which would make fetchJSON throw on res.json(). Use withWorkspaceHeader
  // directly so the x-workspace-id header still gets injected.
  const res = await fetch(
    `/api/balance/settlements/${id}`,
    withWorkspaceHeader({ method: "DELETE" })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    throw new Error(text);
  }
}
