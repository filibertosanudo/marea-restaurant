"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/Button";
import { copyMenuFromBusinessAction } from "@/lib/menu/copy-actions";

type Dict = AdminDictionary["menu"];

/**
 * Offered only on a branch with no menu, and only to someone who runs another
 * branch as well: pick the branch to copy from, and its whole menu arrives as
 * new rows the branch then edits on its own (prices, availability, photos).
 */
export function CopyMenuPanel({ dict, sources }: { dict: Dict; sources: Array<{ id: string; name: string }> }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function copy() {
    setMessage(null);
    startTransition(async () => {
      const result = await copyMenuFromBusinessAction(sourceId);
      if (!result.ok) {
        setMessage({ kind: "error", text: dict.copyMenuErrors[result.error] });
        return;
      }
      setMessage({ kind: "ok", text: dict.copyMenuDone.replace("{dishes}", String(result.dishes)) });
      router.refresh();
    });
  }

  return (
    <section className="mx-lg mt-md rounded-md border border-border bg-surface p-md">
      <h2 className="text-[15px] font-semibold text-on-surface">{dict.copyMenuTitle}</h2>
      <p className="mb-md mt-[2px] text-[12.5px] text-on-surface-muted">{dict.copyMenuLead}</p>
      <div className="flex flex-wrap items-end gap-md">
        <label className="flex flex-col gap-[4px] text-[12px] text-on-surface-muted">
          {dict.copyMenuFrom}
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={pending}
            className="rounded-sm border border-border bg-surface px-[10px] py-[8px] text-[13px] text-on-surface"
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={copy} disabled={pending || !sourceId}>
          {dict.copyMenuButton}
        </Button>
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-sm text-[12.5px] ${message.kind === "error" ? "text-error" : "text-success"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
