"use client";

import { useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteSettlement } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import type { Settlement, Partner } from "@/lib/types";

interface Props {
  settlements: Settlement[];
  partnerA: Partner;
  partnerB: Partner;
}

export function SettlementsList({ settlements, partnerA, partnerB }: Props) {
  const tBalance = useTranslations("balance");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function getPartnerName(id: number): string {
    if (id === partnerA.id) return partnerA.name;
    if (id === partnerB.id) return partnerB.name;
    return String(id);
  }

  async function handleDelete() {
    if (confirmId == null) return;
    setDeleting(true);
    try {
      await deleteSettlement(confirmId);
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {tBalance("settlementsHistory")}
      </h2>

      {settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tBalance("noSettlements")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {settlements.map((settlement) => {
            const fromName = getPartnerName(settlement.fromPartnerId);
            const toName = getPartnerName(settlement.toPartnerId);
            return (
              <li key={settlement.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span>{fromName}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{toName}</span>
                    <span className="tabular-nums">{formatCurrency(settlement.amount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{settlement.date}</span>
                    {settlement.note && (
                      <>
                        <span>·</span>
                        <span className="truncate">{settlement.note}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmId(settlement.id)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={tCommon("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={confirmId != null} onOpenChange={(open) => { if (!open) setConfirmId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tBalance("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{tBalance("deleteConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmId(null)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? tCommon("deleting") : tCommon("delete")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
