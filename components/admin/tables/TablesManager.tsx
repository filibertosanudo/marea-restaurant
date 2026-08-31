"use client";

import Link from "next/link";
import { startTransition, useMemo, useOptimistic, useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { toIntlLocale } from "@/lib/dto/money";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  toggleTableActiveAction,
  toggleOutOfServiceAction,
  rotateTableQrAction,
  reorderTablesAction,
  deleteTableAction,
} from "@/lib/tables/actions";
import { TableEditorDrawer } from "./TableEditorDrawer";

export type TableRow = {
  id: string;
  code: string;
  zone: string | null;
  seats: number;
  isActive: boolean;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "OUT_OF_SERVICE";
  qrRotatedAt: string | null;
};

type TableDict = AdminDictionary["tables"];

type OptimisticUpdate =
  | { type: "toggleActive"; id: string; isActive: boolean }
  | { type: "toggleOutOfService"; id: string; status: TableRow["status"] }
  | { type: "reorder"; orderedIds: string[] }
  | { type: "rotateQr"; id: string; qrRotatedAt: string };

/**
 * `tables` (the server prop, refreshed by every action's revalidatePath)
 * stays the single source of truth — no local useState copy of it, which
 * is exactly the bug that would otherwise leave a just-created batch of
 * tables invisible until a manual reload: a plain `useState(tables)` only
 * takes its initial value on mount and never resyncs when the parent
 * re-renders with fresh data. useOptimistic recomputes from `tables` on
 * every render and only layers a pending-request's guess on top of it.
 */
export function TablesManager({ tables, dict, lang }: { tables: TableRow[]; dict: TableDict; lang: Lang }) {
  const [optimisticTables, applyOptimistic] = useOptimistic(tables, (state, update: OptimisticUpdate) => {
    switch (update.type) {
      case "toggleActive":
        return state.map((t) => (t.id === update.id ? { ...t, isActive: update.isActive } : t));
      case "toggleOutOfService":
        return state.map((t) => (t.id === update.id ? { ...t, status: update.status } : t));
      case "reorder":
        return update.orderedIds.map((id) => state.find((t) => t.id === id)!).filter(Boolean);
      case "rotateQr":
        return state.map((t) => (t.id === update.id ? { ...t, qrRotatedAt: update.qrRotatedAt } : t));
    }
  });

  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TableRow | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<TableRow | null>(null);
  const [rotatePending, setRotatePending] = useState(false);

  const zones = useMemo(() => {
    const set = new Set(optimisticTables.map((t) => t.zone).filter((z): z is string => !!z));
    return Array.from(set);
  }, [optimisticTables]);

  const visible = zoneFilter === "all" ? optimisticTables : optimisticTables.filter((t) => t.zone === zoneFilter);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...optimisticTables];
    const fromIndex = next.findIndex((t) => t.id === dragId);
    const toIndex = next.findIndex((t) => t.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const orderedIds = next.map((t) => t.id);
    setDragId(null);
    startTransition(() => applyOptimistic({ type: "reorder", orderedIds }));
    reorderTablesAction(orderedIds);
  }

  async function handleToggleActive(table: TableRow) {
    startTransition(() => applyOptimistic({ type: "toggleActive", id: table.id, isActive: !table.isActive }));
    await toggleTableActiveAction(table.id, !table.isActive);
  }

  async function handleToggleOutOfService(table: TableRow) {
    const next = table.status === "OUT_OF_SERVICE" ? "AVAILABLE" : "OUT_OF_SERVICE";
    startTransition(() => applyOptimistic({ type: "toggleOutOfService", id: table.id, status: next }));
    await toggleOutOfServiceAction(table.id, next === "OUT_OF_SERVICE");
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteTableAction(deleteTarget.id);
    setDeletePending(false);
    if (result.blocked) {
      setDeleteBlocked(true);
      return;
    }
    setDeleteTarget(null);
  }

  async function handleConfirmRotate() {
    if (!rotateTarget) return;
    setRotatePending(true);
    await rotateTableQrAction(rotateTarget.id);
    setRotatePending(false);
    startTransition(() =>
      applyOptimistic({ type: "rotateQr", id: rotateTarget.id, qrRotatedAt: new Date().toISOString() })
    );
    setRotateTarget(null);
  }

  const editingRow: TableRow | null = editing && editing !== "new" ? editing : null;

  return (
    <div className="p-lg">
      <div className="mb-md flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.title}</h1>
          <p className="mt-[2px] max-w-[52ch] text-[12.5px] text-on-surface-muted">{dict.lead}</p>
        </div>
        <div className="flex gap-sm">
          <Link href="/admin/mesas/imprimir">
            <Button type="button" variant="secondary">
              {dict.printSheet}
            </Button>
          </Link>
          <Button type="button" onClick={() => setEditing("new")}>
            {dict.newTable}
          </Button>
        </div>
      </div>

      {zones.length > 0 && (
        <div className="mb-md inline-flex rounded-full border border-border bg-surface-subtle p-[3px]">
          <button
            type="button"
            onClick={() => setZoneFilter("all")}
            className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
              zoneFilter === "all" ? "bg-primary text-on-primary" : "text-on-surface-muted"
            }`}
          >
            {dict.zoneAll}
          </button>
          {zones.map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setZoneFilter(zone)}
              className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
                zoneFilter === zone ? "bg-primary text-on-primary" : "text-on-surface-muted"
              }`}
            >
              {zone}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-sm rounded-lg bg-surface-subtle p-3xl text-center">
          <h3 className="font-display text-[17px] font-semibold text-on-surface">{dict.emptyTitle}</h3>
          <p className="text-[13px] text-on-surface-muted">{dict.emptyBody}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <div className="flex items-center gap-md border-b border-border bg-surface-subtle px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
            <span className="w-[16px]" />
            <span className="w-[90px]">{dict.colCode}</span>
            <span className="w-[130px]">{dict.colZone}</span>
            <span className="w-[70px]">{dict.colSeats}</span>
            <span className="flex-1">{dict.colStatus}</span>
            <span>{dict.colActions}</span>
          </div>
          {visible.map((table, index) => (
            <div
              key={table.id}
              draggable
              onDragStart={() => setDragId(table.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(table.id)}
              className={`flex flex-wrap items-center gap-md px-md py-[10px] ${
                index !== visible.length - 1 ? "border-b border-border" : ""
              } ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"} ${!table.isActive ? "opacity-55" : ""}`}
            >
              <span aria-hidden className="w-[16px] cursor-grab select-none text-on-surface-muted" title="Drag to reorder">
                ⠿
              </span>
              <span className="w-[90px] text-[13.5px] font-semibold text-on-surface">{table.code}</span>
              <span className="w-[130px] text-[12.5px] text-on-surface-muted">{table.zone ?? "—"}</span>
              <span className="w-[70px] text-[13px] tabular-nums text-on-surface">{table.seats}</span>
              <span className="flex flex-1 flex-wrap items-center gap-sm">
                <button
                  type="button"
                  onClick={() => handleToggleActive(table)}
                  className={`rounded-sm px-[10px] py-[3px] text-[11px] font-medium ${
                    table.isActive ? "bg-success/12 text-success" : "bg-border/16 text-on-surface-muted"
                  }`}
                >
                  {table.isActive ? dict.statusActive : dict.statusInactive}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleOutOfService(table)}
                  className={`rounded-sm px-[10px] py-[3px] text-[11px] font-medium ${
                    table.status === "OUT_OF_SERVICE" ? "bg-warning/12 text-warning" : "bg-border/16 text-on-surface-muted"
                  }`}
                >
                  {table.status === "OUT_OF_SERVICE" ? dict.statusOutOfService : dict.clearOutOfServiceAction}
                </button>
                {table.qrRotatedAt && (
                  <span className="text-[11px] text-on-surface-muted">
                    {dict.qrRotatedNote}: {new Date(table.qrRotatedAt).toLocaleString(toIntlLocale(lang))}
                  </span>
                )}
              </span>
              <span className="flex gap-[2px]">
                <button
                  type="button"
                  onClick={() => setEditing(table)}
                  title={dict.editAction}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-muted hover:bg-surface-raised hover:text-on-surface"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => setRotateTarget(table)}
                  title={dict.rotateQrAction}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-muted hover:bg-warning/12 hover:text-warning"
                >
                  ⟳
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(table);
                    setDeleteBlocked(false);
                  }}
                  title={dict.deleteAction}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-muted hover:bg-error/12 hover:text-error"
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <TableEditorDrawer key={editingRow?.id ?? "new"} open onClose={() => setEditing(null)} dict={dict} table={editingRow} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={dict.deleteConfirmTitle}
        body={deleteBlocked ? dict.deleteBlockedNotice : `${deleteTarget?.code ?? ""} — ${dict.deleteConfirmBody}`}
        confirmLabel={dict.deleteConfirmYes}
        cancelLabel={dict.deleteConfirmNo}
        pending={deletePending}
      />

      <ConfirmDialog
        open={rotateTarget !== null}
        onClose={() => setRotateTarget(null)}
        onConfirm={handleConfirmRotate}
        title={rotateTarget ? `${dict.rotateConfirmTitle} — ${rotateTarget.code}` : dict.rotateConfirmTitle}
        body={dict.rotateConfirmBody}
        confirmLabel={dict.rotateConfirmYes}
        cancelLabel={dict.rotateConfirmNo}
        pending={rotatePending}
      />
    </div>
  );
}
