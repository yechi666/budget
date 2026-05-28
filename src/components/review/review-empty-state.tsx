"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function ReviewEmptyState() {
  const t = useTranslations("review");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <CheckCircle2 className="h-12 w-12 text-[var(--status-on-track)]" />
      <h1 className="font-serif text-xl font-semibold">{t("emptyTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
    </div>
  );
}
