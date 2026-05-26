"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getBalance, listPartners } from "@/lib/api";
import { PageHeader } from "@/components/layout/app-shell";
import { BalanceSummary } from "./balance-summary";
import { MonthlyTable } from "./monthly-table";
import { SettlementDialog } from "./settlement-dialog";
import { SettlementsList } from "./settlements-list";
import { Skeleton } from "@/components/ui/skeleton";

export function BalancePage() {
  const tBalance = useTranslations("balance");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["balance"],
    queryFn: getBalance,
  });

  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
  });

  const isLoading = balanceLoading || partnersLoading;
  const partnerA = partners?.[0];
  const partnerB = partners?.[1];

  return (
    <>
      <PageHeader title={tBalance("pageTitle")} />

      <div className="flex flex-col gap-5 p-4 md:p-6 lg:p-8">
        {isLoading || !balance || !partnerA || !partnerB ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
          </div>
        ) : (
          <>
            <BalanceSummary
              balance={balance}
              partners={partners ?? []}
              onLogSettlement={() => setDialogOpen(true)}
            />
            <MonthlyTable
              months={balance.months}
              partnerA={partnerA}
              partnerB={partnerB}
            />
            <SettlementsList
              settlements={balance.settlements}
              partnerA={partnerA}
              partnerB={partnerB}
            />
            <SettlementDialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              partnerA={partnerA}
              partnerB={partnerB}
            />
          </>
        )}
      </div>
    </>
  );
}
