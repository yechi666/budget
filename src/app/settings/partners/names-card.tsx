"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard } from "@/components/settings/section-shell";
import { deletePartner } from "@/lib/api";
import type { Partner } from "@/lib/types";

interface Props {
  partners: Partner[];
  onRename: (args: { id: number; name: string }) => void;
}

export function NamesCard({ partners, onRename }: Props) {
  const tPartners = useTranslations("settings.partners");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  // Lazy initializer so state tracks the props at mount time.
  // The parent passes key={partner names} so this remounts after a rename.
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(partners.map((p) => [p.id, p.name]))
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePartner(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners"] });
      void queryClient.invalidateQueries({ queryKey: ["partners-credentials"] });
      setConfirmDeleteId(null);
      toast.success(tPartners("deleted"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tPartners("deleteFailed"));
    },
  });

  const partnerToDelete = partners.find((p) => p.id === confirmDeleteId) ?? null;

  return (
    <>
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
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteId(p.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </SettingCard>

      <Dialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tPartners("deleteConfirmTitle", { name: partnerToDelete?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {tPartners("deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDeleteId !== null) deleteMutation.mutate(confirmDeleteId);
              }}
            >
              {deleteMutation.isPending ? tCommon("deleting") : tPartners("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
