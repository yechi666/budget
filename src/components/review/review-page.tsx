"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getReviewItems } from "@/lib/api/review";
import { ReviewItemRow } from "./review-item-row";
import { ReviewEmptyState } from "./review-empty-state";

export function ReviewPage() {
  const t = useTranslations("review");

  const { data: items, isLoading } = useQuery({
    queryKey: ["review"],
    queryFn: getReviewItems,
  });

  return (
    <>
      <PageHeader title={t("pageTitle")} />
      <main className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!isLoading && items && items.length === 0 && <ReviewEmptyState />}
        {!isLoading && items && items.length > 0 && (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ReviewItemRow key={item.transaction.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
