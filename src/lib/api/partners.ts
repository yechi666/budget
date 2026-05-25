import type { Partner, CredentialWithPartner } from "@/lib/types";
import { fetchJSON } from "./_core";

export function listPartners() {
  return fetchJSON<Partner[]>("/api/partners");
}

export function createPartner(name: string) {
  return fetchJSON<Partner>("/api/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function renamePartner(id: number, name: string) {
  return fetchJSON<Partner>(`/api/partners/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function listCredentialsWithPartner() {
  return fetchJSON<CredentialWithPartner[]>("/api/partners/credentials");
}

export function setCredentialPartner(
  credentialId: number,
  partnerId: number | null
) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partnerId }),
  });
}
