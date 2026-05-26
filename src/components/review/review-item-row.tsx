"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { AlertCircle, Users } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { ReviewItem } from "@/lib/types";
import { resolveReviewItem, getCategories } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

interface Props {
  item: ReviewItem;
}

export function ReviewItemRow({ item }: Props) {
  const t = useTranslations("review");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const { transaction, triggers, suggestedCategoryId } = item;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: showCategoryPicker,
  });

  const categories = categoriesData ?? [];

  const resolveMutation = useMutation({
    mutationFn: (body: Parameters<typeof resolveReviewItem>[1]) =>
      resolveReviewItem(transaction.id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["review"] });
      void queryClient.invalidateQueries({ queryKey: ["review-count"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const isLowConfidence = triggers.includes("low-confidence");
  const isUnknownPayer = triggers.includes("unknown-payer");

  const accountLabel = transaction.accountLabel ?? transaction.provider;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{transaction.description}</span>
            {transaction.categoryName && (
              <span
                className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: transaction.categoryColor ?? undefined }}
              >
                {transaction.categoryName}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(transaction.date)}</span>
            <span>·</span>
            <span>{accountLabel}</span>
          </div>
        </div>
        <span className="shrink-0 font-medium tabular-nums">
          {formatCurrency(transaction.chargedAmount, transaction.chargedCurrency ?? "ILS", locale)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isLowConfidence && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            {t("triggerLowConfidence")}
          </span>
        )}
        {isUnknownPayer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Users className="h-3 w-3" />
            {t("triggerUnknownPayer")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isLowConfidence && suggestedCategoryId != null && (
          <button
            type="button"
            className={cn(
              "rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
              resolveMutation.isPending && "pointer-events-none opacity-50"
            )}
            onClick={() =>
              resolveMutation.mutate({ action: "confirm" })
            }
          >
            {t("actionConfirm")}
          </button>
        )}

        {showCategoryPicker ? (
          <select
            className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium"
            defaultValue=""
            onChange={(e) => {
              const catId = Number(e.target.value);
              if (!catId) return;
              setShowCategoryPicker(false);
              resolveMutation.mutate({ action: "set-category", categoryId: catId });
            }}
          >
            <option value="" disabled>{t("actionChangeCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={cn(
              "rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
              resolveMutation.isPending && "pointer-events-none opacity-50"
            )}
            onClick={() => setShowCategoryPicker(true)}
          >
            {t("actionChangeCategory")}
          </button>
        )}

        {isUnknownPayer && (
          <>
            <button
              type="button"
              className={cn(
                "rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
                resolveMutation.isPending && "pointer-events-none opacity-50"
              )}
              onClick={() =>
                resolveMutation.mutate({ action: "mark-individual" })
              }
            >
              {t("actionMarkIndividual")}
            </button>
            <Link
              href="/settings/partners"
              className="rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              {t("actionGoToPartners")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
