"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getReviewCount } from "@/lib/api/review";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

export function ReviewNavBadge() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const { data } = useQuery({
    queryKey: ["review-count"],
    queryFn: getReviewCount,
    refetchInterval: 30000,
  });

  const count = data?.count ?? 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <Link href="/review">
            <AlertCircle />
            <span>{t("review")}</span>
            {count > 0 && (
              <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                {count}
              </span>
            )}
          </Link>
        }
        isActive={pathname.startsWith("/review")}
        tooltip={t("review")}
      />
    </SidebarMenuItem>
  );
}
