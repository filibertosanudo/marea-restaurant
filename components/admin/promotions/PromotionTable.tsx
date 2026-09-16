"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PromotionEditorDrawer } from "./PromotionEditorDrawer";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { PromotionListDTO } from "@/lib/dto/promotions";
import { getPromotionStatus, type PromotionStatus } from "@/lib/promotions/status";
import { describePromotion } from "@/lib/promotions/describe";
import { toggleActivePromotionAction, deletePromotionAction } from "@/lib/promotions/actions";

const STATUS_CLASSES: Record<PromotionStatus, string> = {
  active: "bg-success/12 text-success",
  upcoming: "bg-info/12 text-info",
  expired: "bg-error/12 text-error",
  exhausted: "bg-border/16 text-on-surface-muted",
  inactive: "bg-border/16 text-on-surface-muted",
};

type PromotionRow = PromotionListDTO & { status: PromotionStatus };

type PromotionTableProps = {
  promotions: PromotionRow[];
  menuItems: { id: string; name: string }[];
  dict: AdminDictionary;
  defaultLocale: Lang;
  lang: Lang;
};

export function PromotionTable({ promotions, menuItems, dict, defaultLocale, lang }: PromotionTableProps) {
  const [items, setItems] = useState(promotions);
  const [editing, setEditing] = useState<PromotionListDTO | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionListDTO | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const statusLabel: Record<PromotionStatus, string> = {
    active: dict.promotions.statusActive,
    upcoming: dict.promotions.statusUpcoming,
    expired: dict.promotions.statusExpired,
    exhausted: dict.promotions.statusExhausted,
    inactive: dict.promotions.statusInactive,
  };

  function withRecomputedStatus(promo: PromotionRow, isActive: boolean): PromotionRow {
    return {
      ...promo,
      isActive,
      status: getPromotionStatus(
        {
          isActive,
          startsAt: promo.startsAt ? new Date(promo.startsAt) : null,
          endsAt: promo.endsAt ? new Date(promo.endsAt) : null,
          usageLimit: promo.usageLimit,
          usageCount: promo.usageCount,
        },
        new Date()
      ),
    };
  }

  async function handleToggleActive(promo: PromotionRow) {
    setItems((prev) => prev.map((p) => (p.id === promo.id ? withRecomputedStatus(p, !promo.isActive) : p)));
    const result = await toggleActivePromotionAction(promo.id, !promo.isActive);
    if ("error" in result) {
      // A stale row (already deleted, or edited from another tab) — revert
      // the optimistic flip and let a fresh load show what's actually true.
      setItems((prev) => prev.map((p) => (p.id === promo.id ? withRecomputedStatus(p, promo.isActive) : p)));
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      const result = await deletePromotionAction(deleteTarget.id);
      if (!("error" in result)) {
        setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      }
    } finally {
      setDeletePending(false);
      setDeleteTarget(null);
    }
  }

  const editingDTO: PromotionListDTO | null = editing && editing !== "new" ? editing : null;

  return (
    <div className="flex h-full flex-col p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.promotions.title}</h1>
        <Button onClick={() => setEditing("new")}>{dict.promotions.newPromotion}</Button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.promotions.columnName}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.promotions.columnCode}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.promotions.columnStatus}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.promotions.columnUsage}
              </th>
              <th className="px-md py-[10px]" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-md py-xl text-center text-on-surface-muted">
                  {dict.promotions.noResults}
                </td>
              </tr>
            )}
            {items.map((promo, index) => (
              <tr
                key={promo.id}
                className={`border-t border-border align-top ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-md py-[10px]">
                  <div className="font-medium text-on-surface">{promo.title}</div>
                  <div className="mt-[2px] text-[12px] text-on-surface-muted">{describePromotion(promo, dict, lang)}</div>
                </td>
                <td className="px-md py-[10px] text-on-surface-muted">{promo.code ?? "—"}</td>
                <td className="px-md py-[10px]">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(promo)}
                    className={`rounded-sm px-[10px] py-[3px] text-[11px] font-medium ${STATUS_CLASSES[promo.status]}`}
                  >
                    {statusLabel[promo.status]}
                  </button>
                </td>
                <td className="px-md py-[10px] text-on-surface-muted">
                  {promo.usageCount}
                  {promo.usageLimit !== null ? ` / ${promo.usageLimit}` : ""}
                </td>
                <td className="px-md py-[10px] text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(promo)}
                    className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean"
                  >
                    {dict.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(promo)}
                    className="rounded-sm px-[10px] py-[6px] text-[13px] text-error hover:bg-error/10"
                  >
                    {dict.common.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <PromotionEditorDrawer
          key={editingDTO?.id ?? "new"}
          onClose={() => setEditing(null)}
          dict={dict}
          defaultLocale={defaultLocale}
          lang={lang}
          promotion={editingDTO}
          menuItems={menuItems}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget ? `${dict.promotions.deletePromotion} — ${deleteTarget.title}` : dict.promotions.deletePromotion}
        body={dict.promotions.deleteConfirmBody}
        confirmLabel={dict.promotions.deletePromotion}
        cancelLabel={dict.promotions.cancel}
        pending={deletePending}
      />
    </div>
  );
}
