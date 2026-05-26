import type { Integration } from "@/lib/types";
import { fetchJSON } from "./_core";

export function listIntegrations() {
  return fetchJSON<Integration[]>("/api/integrations");
}

export function updateIntegrationSettings(
  credentialId: number,
  updates: { requiresManualTwoFactor?: boolean; resetTwoFactorToken?: boolean }
) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function getIntegrationCredentials(credentialId: number) {
  return fetchJSON<{
    credentials: Record<string, string> | null;
    label: string | null;
    provider: string | null;
    requiresManualTwoFactor: boolean;
    hasTwoFactorToken: boolean;
  }>(`/api/integrations/${credentialId}`);
}

export function deleteIntegration(credentialId: number) {
  return fetchJSON<{ success: boolean }>(`/api/integrations/${credentialId}`, {
    method: "DELETE",
  });
}
