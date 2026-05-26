import type { Partner, CredentialWithPartner } from "@/lib/types";
import { fetchJSON, withWorkspaceHeader } from "./_core";

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

export async function deletePartner(id: number): Promise<void> {
  const res = await fetch(`/api/partners/${id}`, {
    method: "DELETE",
    ...withWorkspaceHeader(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    throw new Error(text);
  }
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
