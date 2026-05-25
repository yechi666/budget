"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard } from "@/components/settings/section-shell";
import type { Partner } from "@/lib/types";

interface Props {
  partners: Partner[];
  onRename: (args: { id: number; name: string }) => void;
}

export function NamesCard({ partners, onRename }: Props) {
  const tPartners = useTranslations("settings.partners");
  // Lazy initializer so state tracks the props at mount time.
  // The parent passes key={partner names} so this remounts after a rename.
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(partners.map((p) => [p.id, p.name]))
  );

  return (
    <SettingCard title={tPartners("namesCardTitle")} description={tPartners("namesCardDesc")}>
      <div className="space-y-3">
        {partners.map((p, i) => (
          <div key={p.id} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>
                {i === 0 ? tPartners("partner1Label") : tPartners("partner2Label")}
              </Label>
              <Input
                value={names[p.id] ?? p.name}
                onChange={(e) =>
                  setNames((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !names[p.id]?.trim() || names[p.id]?.trim() === p.name
              }
              onClick={() =>
                onRename({ id: p.id, name: names[p.id] ?? p.name })
              }
            >
              {tPartners("saveButton")}
            </Button>
          </div>
        ))}
      </div>
    </SettingCard>
  );
}
