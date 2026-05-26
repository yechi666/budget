"use client";

import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/formatters";
import type { BalanceResponse, Partner } from "@/lib/types";

interface Props {
  balance: BalanceResponse;
  partners: Partner[];
  onLogSettlement: () => void;
}

export function BalanceSummary({ balance, partners, onLogSettlement }: Props) {
  const tBalance = useTranslations("balance");

  const owedToPartner = partners.find((p) => p.id === balance.owedToPartnerId);
  const owedToName = owedToPartner?.name ?? String(balance.owedToPartnerId);

  const isEven = balance.runningBalance === 0;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          {isEven ? (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[var(--status-on-track)]" />
              <span className="font-serif text-2xl">{tBalance("youreEven")}</span>
            </div>
          ) : (
            <p className="font-serif text-2xl">
              {tBalance("owedMessage", {
                name: owedToName,
                amount: formatCurrency(balance.runningBalance),
              })}
            </p>
          )}
        </div>

        <button
          onClick={onLogSettlement}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {tBalance("logSettlement")}
        </button>
      </div>
    </div>
  );
}
