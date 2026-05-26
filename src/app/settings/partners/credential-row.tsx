"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";
import type { Partner, CredentialWithPartner } from "@/lib/types";

interface Props {
  cred: CredentialWithPartner;
  partners: Partner[];
  onAssign: (partnerId: number | null) => void;
  tBanks: ReturnType<typeof useTranslations>;
}

export function CredentialRow({ cred, partners, onAssign, tBanks }: Props) {
  const tPartners = useTranslations("settings.partners");
  const info = BANK_PROVIDERS.find((b) => b.id === cred.provider);
  const localName = info
    ? translateProviderName(info.id, info.name, tBanks)
    : cred.provider;

  const selectValue =
    cred.partner === null ? "unassigned" : String(cred.partner.id);

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
        {cred.partner === null && (
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
            <SelectItem value="unassigned">{tPartners("unassigned")}</SelectItem>
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
