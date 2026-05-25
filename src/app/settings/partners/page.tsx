"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { ProviderBadge } from "@/components/setup/provider-badge";
import {
  listPartners,
  createPartner,
  renamePartner,
  listCredentialsWithPartner,
  setCredentialPartner,
} from "@/lib/api";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";
import { useTranslations as useBankTranslations } from "next-intl";
import type { Partner, CredentialWithPartner } from "@/lib/types";

export default function PartnersPage() {
  const t = useTranslations("settings.partners");
  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
  });

  const isSetup = partners.length >= 2;

  return (
    <SectionShell title={t("title")} description={t("description")}>
      {isLoading ? null : isSetup ? (
        <SetupDone partners={partners} />
      ) : (
        <FirstTimeSetup existingPartners={partners} />
      )}
    </SectionShell>
  );
}

function FirstTimeSetup({ existingPartners }: { existingPartners: Partner[] }) {
  const t = useTranslations("settings.partners");
  const qc = useQueryClient();
  const [name1, setName1] = useState(existingPartners[0]?.name ?? "");
  const [name2, setName2] = useState(existingPartners[1]?.name ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      const results: Partner[] = [...existingPartners];

      // Partner 1: create if new, or rename if the name was edited.
      if (results.length === 0) {
        results.push(await createPartner(name1.trim()));
      } else if (results[0].name !== name1.trim()) {
        const renamed = await renamePartner(results[0].id, name1.trim());
        if (renamed) results[0] = renamed;
      }

      // Partner 2: always needs to be created at this point.
      if (results.length < 2) {
        results.push(await createPartner(name2.trim()));
      }

      return results;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partners"] });
      toast.success(t("setupSaved"));
    },
    onError: (err) => {
      // C5: invalidate so the cache reflects what was actually saved in the DB,
      // preventing a stuck UI when the first partner was committed but the
      // second failed.
      void qc.invalidateQueries({ queryKey: ["partners"] });
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    },
  });

  // C8: case-insensitive comparison to match the DB COLLATE NOCASE constraint.
  const canSave =
    name1.trim().length > 0 &&
    name2.trim().length > 0 &&
    name1.trim().toLowerCase() !== name2.trim().toLowerCase();

  return (
    <SettingCard title={t("setupCardTitle")} description={t("setupCardDesc")}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("partner1Label")}</Label>
            {/* C6: never disable name1 — if partner 1 was already saved but
                partner 2 failed, the user must be able to correct a typo. The
                mutation handles rename vs create automatically. */}
            <Input
              value={name1}
              onChange={(e) => setName1(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("partner2Label")}</Label>
            <Input
              value={name2}
              onChange={(e) => setName2(e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={existingPartners.length >= 2}
            />
          </div>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}
        >
          {t("getStarted")}
        </Button>
      </div>
    </SettingCard>
  );
}

function SetupDone({ partners }: { partners: Partner[] }) {
  const t = useTranslations("settings.partners");
  const tBanks = useBankTranslations("banks");
  const qc = useQueryClient();

  const { data: credentials = [] } = useQuery({
    queryKey: ["partners-credentials"],
    queryFn: listCredentialsWithPartner,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renamePartner(id, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partners"] });
      toast.success(t("renamed"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
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
    // C7: optimistic update so the dropdown reflects the new value immediately
    // without waiting for the refetch, eliminating the visible snap-back.
    onMutate: async ({ credentialId, partnerId }) => {
      await qc.cancelQueries({ queryKey: ["partners-credentials"] });
      const previous = qc.getQueryData<CredentialWithPartner[]>(["partners-credentials"]);
      qc.setQueryData<CredentialWithPartner[]>(
        ["partners-credentials"],
        (old) => old?.map((c) => c.id === credentialId ? { ...c, partnerId } : c) ?? []
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["partners-credentials"], context.previous);
      }
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["partners-credentials"] });
    },
  });

  const unassignedCount = credentials.filter((c) => c.partnerId === null).length;

  return (
    <>
      <NamesCard
        key={partners.map((p) => p.name).join(",")}
        partners={partners}
        onRename={renameMutation.mutate}
      />

      <SettingCard
        title={t("assignTitle")}
        description={t("assignDescription")}
      >
        {unassignedCount > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {t("unassignedWarning", { count: unassignedCount })}
          </div>
        )}

        {credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBanks")}</p>
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

function NamesCard({
  partners,
  onRename,
}: {
  partners: Partner[];
  onRename: (args: { id: number; name: string }) => void;
}) {
  const t = useTranslations("settings.partners");
  // Lazy initializer so state tracks the props at mount time.
  // The parent passes key={partner names} so this remounts after a rename.
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(partners.map((p) => [p.id, p.name]))
  );

  return (
    <SettingCard title={t("namesCardTitle")} description={t("namesCardDesc")}>
      <div className="space-y-3">
        {partners.map((p, i) => (
          <div key={p.id} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>
                {i === 0 ? t("partner1Label") : t("partner2Label")}
              </Label>
              <Input
                value={names[p.id] ?? p.name}
                onChange={(e) =>
                  setNames((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !names[p.id]?.trim() || names[p.id]?.trim() === p.name
              }
              onClick={() =>
                onRename({ id: p.id, name: names[p.id] ?? p.name })
              }
            >
              {t("saveButton")}
            </Button>
          </div>
        ))}
      </div>
    </SettingCard>
  );
}

function CredentialRow({
  cred,
  partners,
  onAssign,
  tBanks,
}: {
  cred: CredentialWithPartner;
  partners: Partner[];
  onAssign: (partnerId: number | null) => void;
  tBanks: ReturnType<typeof useBankTranslations>;
}) {
  const t = useTranslations("settings.partners");
  const info = BANK_PROVIDERS.find((b) => b.id === cred.provider);
  const localName = info
    ? translateProviderName(info.id, info.name, tBanks)
    : cred.provider;

  const selectValue =
    cred.partnerId === null ? "unassigned" : String(cred.partnerId);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {info && (
        <ProviderBadge
          color={info.color}
          name={localName}
          domain={info.domain}
          size={32}
          radius={8}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{cred.label}</div>
        <div className="text-xs text-muted-foreground">{localName}</div>
      </div>
      <div className="flex items-center gap-2">
        {cred.partnerId === null && (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
        )}
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (!v) return;
            onAssign(v === "unassigned" ? null : Number(v));
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}
