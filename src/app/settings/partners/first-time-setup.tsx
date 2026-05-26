"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard } from "@/components/settings/section-shell";
import { createPartner, renamePartner } from "@/lib/api";
import type { Partner } from "@/lib/types";

interface Props {
  existingPartners: Partner[];
}

export function FirstTimeSetup({ existingPartners }: Props) {
  const tPartners = useTranslations("settings.partners");
  const queryClient = useQueryClient();
  const [firstPartnerName, setFirstPartnerName] = useState(
    existingPartners[0]?.name ?? ""
  );
  const [secondPartnerName, setSecondPartnerName] = useState(
    existingPartners[1]?.name ?? ""
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const results: Partner[] = [...existingPartners];

      // Partner 1: create if new, or rename if the name was edited.
      if (results.length === 0) {
        results.push(await createPartner(firstPartnerName.trim()));
      } else if (results[0].name !== firstPartnerName.trim()) {
        const renamed = await renamePartner(results[0].id, firstPartnerName.trim());
        if (renamed) results[0] = renamed;
      }

      // Partner 2: always needs to be created at this point.
      if (results.length < 2) {
        results.push(await createPartner(secondPartnerName.trim()));
      }

      return results;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success(tPartners("setupSaved"));
    },
    onError: (err) => {
      // Invalidate so the cache reflects what was actually saved in the DB,
      // preventing a stuck UI when the first partner was committed but the
      // second failed.
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.error(err instanceof Error ? err.message : tPartners("saveFailed"));
    },
  });

  // Case-insensitive comparison to match the DB COLLATE NOCASE constraint.
  const canSave =
    firstPartnerName.trim().length > 0 &&
    secondPartnerName.trim().length > 0 &&
    firstPartnerName.trim().toLowerCase() !== secondPartnerName.trim().toLowerCase();

  return (
    <SettingCard title={tPartners("setupCardTitle")} description={tPartners("setupCardDesc")}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tPartners("partner1Label")}</Label>
            {/* If partner 1 was already saved but partner 2 failed, the user
                must be able to correct a typo. The mutation handles rename vs
                create automatically. */}
            <Input
              value={firstPartnerName}
              onChange={(e) => setFirstPartnerName(e.target.value)}
              placeholder={tPartners("namePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tPartners("partner2Label")}</Label>
            <Input
              value={secondPartnerName}
              onChange={(e) => setSecondPartnerName(e.target.value)}
              placeholder={tPartners("namePlaceholder")}
            />
          </div>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}
        >
          {tPartners("getStarted")}
        </Button>
      </div>
    </SettingCard>
  );
}
