"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { CategoryListDTO } from "@/lib/dto/menu";
import {
  reorderCategoriesAction,
  toggleCategoryActiveAction,
  deleteCategoryAction,
} from "@/lib/menu/category-actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CategoryFormModal } from "./CategoryFormModal";

type CategoryListProps = {
  categories: CategoryListDTO[];
  dict: AdminDictionary;
  defaultLocale: Lang;
};

export function CategoryList({ categories, dict, defaultLocale }: CategoryListProps) {
  const [items, setItems] = useState(categories);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryListDTO | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryListDTO | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...items];
    const fromIndex = next.findIndex((c) => c.id === dragId);
    const toIndex = next.findIndex((c) => c.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    setDragId(null);
    reorderCategoriesAction(next.map((c) => c.id));
  }

  async function handleToggleActive(category: CategoryListDTO) {
    setItems((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, isActive: !c.isActive } : c))
    );
    await toggleCategoryActiveAction(category.id, !category.isActive);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteCategoryAction(deleteTarget.id);
    setDeletePending(false);
    if (result.blocked) {
      setBlockedNotice(deleteTarget.id);
      setDeleteTarget(null);
      return;
    }
    setItems((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  const editingDTO: CategoryListDTO | null = editing && editing !== "new" ? editing : null;

  return (
    <div className="p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">
          {dict.menu.categoriesTitle}
        </h1>
        <Button onClick={() => setEditing("new")}>{dict.menu.newCategory}</Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {items.map((category, index) => (
          <div key={category.id}>
            {blockedNotice === category.id && (
              <div className="border-b border-border bg-warning/10 px-md py-[8px] text-[12px] text-warning">
                {dict.menu.deleteCategoryBlocked}
              </div>
            )}
            <div
              draggable
              onDragStart={() => setDragId(category.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(category.id)}
              className={`flex items-center gap-md px-md py-[10px] ${
                index !== items.length - 1 ? "border-b border-border" : ""
              } ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
            >
              <span
                aria-hidden
                className="cursor-grab select-none text-on-surface-muted"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <span className="flex-1 text-[14px] font-medium text-on-surface">
                {category.name}
                {category.missingLocales.length > 0 && (
                  <span className="ml-[8px] rounded-sm bg-warning/12 px-[8px] py-[2px] text-[11px] font-medium text-warning">
                    {dict.menu.missingTranslation.replace(
                      "{locale}",
                      category.missingLocales.join(", ").toUpperCase()
                    )}
                  </span>
                )}
              </span>
              <span className="text-[12px] text-on-surface-muted">
                {category.itemCount}
              </span>
              <button
                type="button"
                onClick={() => handleToggleActive(category)}
                className={`rounded-sm px-[10px] py-[3px] text-[11px] font-medium ${
                  category.isActive
                    ? "bg-success/12 text-success"
                    : "bg-border/16 text-on-surface-muted"
                }`}
              >
                {category.isActive ? dict.menu.categoryActive : dict.menu.categoryInactive}
              </button>
              <button
                type="button"
                onClick={() => setEditing(category)}
                className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean"
              >
                {dict.menu.editCategory}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(category)}
                className="rounded-sm px-[10px] py-[6px] text-[13px] text-error hover:bg-error/10"
              >
                {dict.common.delete}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        // key forces a fresh mount per open — useActionState binds its
        // action on mount, and uncontrolled inputs only take defaultValue
        // on mount too, so reusing one instance across opens would leave
        // both the bound action and the field values stale.
        <CategoryFormModal
          key={editingDTO?.id ?? "new"}
          open
          onClose={() => setEditing(null)}
          dict={dict}
          defaultLocale={defaultLocale}
          category={editingDTO}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget ? `${dict.common.delete} — ${deleteTarget.name}` : dict.common.delete}
        body={deleteTarget ? `${deleteTarget.name} — ${dict.common.confirm}?` : ""}
        confirmLabel={dict.common.delete}
        cancelLabel={dict.menu.cancel}
        pending={deletePending}
      />
    </div>
  );
}
