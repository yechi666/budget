"use client";

import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/formatters";
import type { MonthlyBalanceRow, Partner } from "@/lib/types";

interface Props {
  months: MonthlyBalanceRow[];
  partnerA: Partner;
  partnerB: Partner;
}

export function MonthlyTable({ months, partnerA, partnerB }: Props) {
  const tBalance = useTranslations("balance");

  if (months.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {tBalance("monthlyBreakdown")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 text-start font-medium">{tBalance("colMonth")}</th>
              <th className="pb-2 text-end font-medium">{tBalance("colShared")}</th>
              <th className="pb-2 text-end font-medium">
                {tBalance("colPaid", { name: partnerA.name })}
              </th>
              <th className="pb-2 text-end font-medium">
                {tBalance("colPaid", { name: partnerB.name })}
              </th>
              <th className="pb-2 text-end font-medium">
                {tBalance("colShare", { name: partnerA.name })}
              </th>
              <th className="pb-2 text-end font-medium">
                {tBalance("colShare", { name: partnerB.name })}
              </th>
              <th className="pb-2 text-end font-medium">{tBalance("colDelta")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month} className="border-b border-border/50 last:border-0">
                <td className="py-2.5 text-start">{row.label}</td>
                <td className="py-2.5 text-end tabular-nums">
                  {formatCurrency(row.sharedTotal)}
                </td>
                <td className="py-2.5 text-end tabular-nums">
                  {formatCurrency(row.partnerAPaid)}
                </td>
                <td className="py-2.5 text-end tabular-nums">
                  {formatCurrency(row.partnerBPaid)}
                </td>
                <td className="py-2.5 text-end tabular-nums">
                  {formatCurrency(row.partnerAShare)}
                </td>
                <td className="py-2.5 text-end tabular-nums">
                  {formatCurrency(row.partnerBShare)}
                </td>
                <td
                  className={`py-2.5 text-end tabular-nums ${
                    row.netDelta > 0
                      ? "text-[var(--status-on-track)]"
                      : row.netDelta < 0
                        ? "text-[var(--status-over)]"
                        : "text-muted-foreground"
                  }`}
                >
                  {row.netDelta >= 0 ? "+" : ""}
                  {formatCurrency(Math.abs(row.netDelta))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
