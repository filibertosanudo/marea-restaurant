"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { deleteSampleDataAction, type DeleteSampleResult } from "@/lib/onboarding/sample-actions";

/** Shown for as long as the business has sample rows, so deleting them is one obvious click and never a search. */
export function SampleDataBanner({ dict, cancelLabel }: { dict: AdminDictionary["onboarding"]; cancelLabel: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DeleteSampleResult | null>(null);

  function run() {
    startTransition(async () => {
      setResult(await deleteSampleDataAction());
      setConfirming(false);
      router.refresh();
    });
  }

  if (result) {
    const kept = result.kept.items + result.kept.categories + result.kept.tables;
    return (
      <div role="status" className="mx-lg mt-md rounded-md border border-border bg-surface-subtle p-md text-[13px] text-on-surface">
        {dict.sampleDeleted
          .replace("{items}", String(result.deleted.items))
          .replace("{categories}", String(result.deleted.categories))
          .replace("{tables}", String(result.deleted.tables))}
        {kept > 0 && <> {dict.sampleKept.replace("{count}", String(kept))}</>}
      </div>
    );
  }

  return (
    <div className="mx-lg mt-md flex flex-wrap items-center justify-between gap-md rounded-md border border-surface-ocean-border bg-surface-ocean p-md">
      <div>
        <p className="text-[13px] font-medium text-on-surface">{dict.sampleBannerTitle}</p>
        <p className="text-[12px] text-on-surface-muted">{dict.sampleBannerBody}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        {dict.deleteSample}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={run}
        title={dict.deleteSampleConfirmTitle}
        body={dict.deleteSampleConfirmBody}
        confirmLabel={dict.deleteSample}
        cancelLabel={cancelLabel}
        pending={pending}
      />
    </div>
  );
}
