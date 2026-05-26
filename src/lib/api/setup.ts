import { fetchJSON } from "./_core";

export function saveBankCredentials(
  provider: string,
  credentials: Record<string, string>,
  options?: {
    label?: string;
    credentialId?: number;
    requiresManualTwoFactor?: boolean;
  }
) {
  return fetchJSON<{ success: boolean; credentialId: number }>("/api/setup/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      credentials,
      ...(options?.label !== undefined ? { label: options.label } : {}),
      ...(options?.credentialId !== undefined
        ? { credentialId: options.credentialId }
        : {}),
      ...(options?.requiresManualTwoFactor !== undefined
        ? { requiresManualTwoFactor: options.requiresManualTwoFactor }
        : {}),
    }),
  });
}

export function testBankConnection(
  provider: string,
  options?: { credentialId?: number; credentials?: Record<string, string> }
) {
  return fetchJSON<{
    success: boolean;
    message: string;
    accountsFound?: number;
  }>("/api/setup/bank/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      ...(options?.credentialId !== undefined
        ? { credentialId: options.credentialId }
        : {}),
      ...(options?.credentials !== undefined
        ? { credentials: options.credentials }
        : {}),
    }),
  });
}

export function saveAIConfig(config: {
  provider: "claude" | "ollama" | "none";
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}) {
  return fetchJSON<{ success: boolean }>("/api/setup/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}
