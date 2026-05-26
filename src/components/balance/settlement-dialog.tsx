"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSettlement } from "@/lib/api";
import type { Partner } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  partnerA: Partner;
  partnerB: Partner;
}

export function SettlementDialog({ open, onClose, partnerA, partnerB }: Props) {
  const tBalance = useTranslations("balance");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  // direction: "AtoB" means partner A transferred money to partner B
  // (this is the natural reading of "A paid B" in the UI label).
  // Settlement from_partner_id = the one who transferred (A here).
  const [direction, setDirection] = useState<string>("AtoB");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setAmount("");
    setDate(today);
    setNote("");
    setDirection("AtoB");
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Date must be in YYYY-MM-DD format");
      return;
    }

    // direction "AtoB" => A transferred money to B => from=A, to=B.
    // direction "BtoA" => B transferred money to A => from=B, to=A.
    const fromPartnerId = direction === "AtoB" ? partnerA.id : partnerB.id;
    const toPartnerId = direction === "AtoB" ? partnerB.id : partnerA.id;

    setSubmitting(true);
    try {
      await createSettlement({
        fromPartnerId,
        toPartnerId,
        amount: amountNum,
        date,
        note: note.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tBalance("logSettlement")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {tBalance("amount")}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {tBalance("date")}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {tBalance("whoPaid")}
            </label>
            <Select
              value={direction}
              onValueChange={(val) => { if (val) setDirection(val); }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AtoB">
                  {tBalance("paidLabel", { from: partnerA.name, to: partnerB.name })}
                </SelectItem>
                <SelectItem value="BtoA">
                  {tBalance("paidLabel", { from: partnerB.name, to: partnerA.name })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {tBalance("noteOptional")}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="-mx-4 -mb-4 flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 px-4 py-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? tCommon("saving") : tCommon("save")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
