import type { BalanceResponse, Settlement } from "@/lib/types";
import { fetchJSON } from "./_core";

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

export function deleteSettlement(id: number) {
  return fetch(`/api/balance/settlements/${id}`, {
    method: "DELETE",
  });
}
