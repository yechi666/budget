"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { setTransactionSharingOverride } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SharingType, TransactionWithCategory } from "@/lib/types";

interface Props {
  transaction: TransactionWithCategory;
}

export function SharingChip({ transaction }: Props) {
  const t = useTranslations("transactions");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const computedType: SharingType =
    transaction.sharingOverride ??
    transaction.categorySharingType ??
    "individual";

  const mutation = useMutation({
    mutationFn: (value: SharingType | null) =>
      setTransactionSharingOverride(transaction.id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: ["review-count"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setOpen(false);
    },
    onError: () => {
      toast.error(t("sharingUpdateFailed"));
    },
  });

  // Show the chip when:
  // 1. The effective sharing type is non-individual (category default or
  //    override makes this a shared transaction), OR
  // 2. The user has set sharing_override = 'individual' on top of a category
  //    that defaults to a shared type. Without this branch the override
  //    would be invisible and uncleared able once set.
  const isIndividualOverride =
    transaction.sharingOverride === "individual" &&
    transaction.categorySharingType != null &&
    transaction.categorySharingType !== "individual";

  if (computedType === "individual" && !isIndividualOverride) return null;

  const effectiveType = computedType;

  const label = isIndividualOverride
    ? t("sharingChipIndividual")
    : effectiveType === "fixed"
      ? t("sharingChipShared")
      : t("sharingChipRatioed");

  const chipClass = cn(
    "inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent px-2 py-0.5 text-xs outline-none",
    isIndividualOverride
      ? "bg-muted text-muted-foreground"
      : effectiveType === "fixed"
        ? "bg-secondary text-secondary-foreground"
        : "bg-accent text-accent-foreground"
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
        <span>{label}</span>
        {transaction.sharingOverride != null ? (
          <Pencil className="h-3 w-3" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56 p-3">
        <p className="mb-2 text-sm font-medium">{t("sharingChangeTitle")}</p>
        <div className="flex flex-col gap-1">
          <Button
            variant={effectiveType === "individual" ? "default" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => mutation.mutate("individual")}
            disabled={mutation.isPending}
          >
            {t("sharingChipIndividual")}
          </Button>
          <Button
            variant={effectiveType === "fixed" ? "default" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => mutation.mutate("fixed")}
            disabled={mutation.isPending}
          >
            {t("sharingChipShared")}
          </Button>
          <Button
            variant={effectiveType === "ratioed" ? "default" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => mutation.mutate("ratioed")}
            disabled={mutation.isPending}
          >
            {t("sharingChipRatioed")}
          </Button>
          {transaction.sharingOverride != null ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 justify-start"
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
            >
              {t("sharingClearOverride")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
