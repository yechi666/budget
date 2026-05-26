"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CardShell } from "./card-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { getBalance, listPartners } from "@/lib/api";

export function BalanceCard() {
  const tBalance = useTranslations("balance");

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["balance"],
    queryFn: getBalance,
  });

  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
  });

  const isLoading = balanceLoading || partnersLoading;

  if (isLoading) {
    return (
      <CardShell label={tBalance("cardTitle")}>
        <Skeleton className="h-12 w-full" />
      </CardShell>
    );
  }

  const isEven = !balance || balance.runningBalance === 0;

  if (isEven) {
    return (
      <CardShell label={tBalance("cardTitle")}>
        <div className="flex items-center gap-2 py-2">
          <span className="h-2 w-2 rounded-full bg-[var(--status-on-track)]" />
          <span className="text-sm font-medium">{tBalance("youreEven")}</span>
        </div>
      </CardShell>
    );
  }

  const owedToPartner = partners?.find((p) => p.id === balance.owedToPartnerId);
  const owedToName = owedToPartner?.name ?? String(balance.owedToPartnerId);

  return (
    <CardShell
      label={tBalance("cardTitle")}
      action={
        <Link
          href="/balance"
          className="flex items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline"
        >
          {tBalance("details")}
          <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="py-2">
        <p className="text-sm text-muted-foreground">
          {tBalance("owedMessage", {
            name: owedToName,
            amount: formatCurrency(balance.runningBalance),
          })}
        </p>
      </div>
    </CardShell>
  );
}
