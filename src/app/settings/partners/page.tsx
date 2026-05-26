"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { SectionShell } from "@/components/settings/section-shell";
import { listPartners } from "@/lib/api";
import { FirstTimeSetup } from "./first-time-setup";
import { SetupDone } from "./setup-done";

export default function PartnersPage() {
  const tPartners = useTranslations("settings.partners");
  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
  });

  const isSetup = partners.length >= 2;

  return (
    <SectionShell title={tPartners("title")} description={tPartners("description")}>
      {isLoading ? null : isSetup ? (
        <SetupDone partners={partners} />
      ) : (
        <FirstTimeSetup existingPartners={partners} />
      )}
    </SectionShell>
  );
}
