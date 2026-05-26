"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { SettingCard } from "@/components/settings/section-shell";
import {
  renamePartner,
  listCredentialsWithPartner,
  setCredentialPartner,
} from "@/lib/api";
import type { Partner, CredentialWithPartner } from "@/lib/types";
import { NamesCard } from "./names-card";
import { CredentialRow } from "./credential-row";

interface Props {
  partners: Partner[];
}

export function SetupDone({ partners }: Props) {
  const tPartners = useTranslations("settings.partners");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();

  const { data: credentials = [] } = useQuery({
    queryKey: ["partners-credentials"],
    queryFn: listCredentialsWithPartner,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renamePartner(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success(tPartners("renamed"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tPartners("saveFailed"));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({
      credentialId,
      partnerId,
    }: {
      credentialId: number;
      partnerId: number | null;
    }) => setCredentialPartner(credentialId, partnerId),
    // Optimistic update so the dropdown reflects the new value immediately
    // without waiting for the refetch, eliminating the visible snap-back.
    onMutate: async ({ credentialId, partnerId }) => {
      await queryClient.cancelQueries({ queryKey: ["partners-credentials"] });
      const previous = queryClient.getQueryData<CredentialWithPartner[]>(["partners-credentials"]);
      const newPartner = partnerId !== null
        ? (partners.find((p) => p.id === partnerId) ?? null)
        : null;
      queryClient.setQueryData<CredentialWithPartner[]>(
        ["partners-credentials"],
        (old) =>
          old?.map((cred) =>
            cred.id === credentialId ? { ...cred, partner: newPartner } : cred
          ) ?? []
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["partners-credentials"], context.previous);
      }
      toast.error(err instanceof Error ? err.message : tPartners("saveFailed"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners-credentials"] });
    },
  });

  const unassignedCount = credentials.filter((cred) => cred.partner === null).length;

  return (
    <>
      <NamesCard
        key={partners.map((p) => p.name).join(",")}
        partners={partners}
        onRename={renameMutation.mutate}
      />

      <SettingCard
        title={tPartners("assignTitle")}
        description={tPartners("assignDescription")}
      >
        {unassignedCount > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {tPartners("unassignedWarning", { count: unassignedCount })}
          </div>
        )}

        {credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPartners("noBanks")}</p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
            {credentials.map((cred) => (
              <CredentialRow
                key={cred.id}
                cred={cred}
                partners={partners}
                onAssign={(partnerId) =>
                  assignMutation.mutate({ credentialId: cred.id, partnerId })
                }
                tBanks={tBanks}
              />
            ))}
          </ul>
        )}
      </SettingCard>
    </>
  );
}
