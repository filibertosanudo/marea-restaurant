"use client";

import { useOptimistic, useRef, useState, useTransition, startTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ItemEditorDrawer } from "./ItemEditorDrawer";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { CategoryListDTO, MenuItemListDTO, ModifierGroupDTO, TagDTO } from "@/lib/dto/menu";
import { toggleAvailabilityAction, softDeleteMenuItemAction } from "@/lib/menu/item-actions";

type ItemTableProps = {
  items: MenuItemListDTO[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategoryListDTO[];
  tags: TagDTO[];
  modifierGroups: ModifierGroupDTO[];
  dict: AdminDictionary;
  defaultLocale: Lang;
  canManage: boolean;
  filters: { q: string; category: string; availability: string };
};

export function ItemTable({
  items,
  total,
  page,
  pageSize,
  categories,
  tags,
  modifierGroups,
  dict,
  defaultLocale,
  canManage,
  filters,
}: ItemTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNav] = useTransition();

  const [optimisticItems, setOptimisticAvailability] = useOptimistic(
    items,
    (state, id: string) =>
      state.map((i) => (i.id === id ? { ...i, isAvailable: !i.isAvailable } : i))
  );

  const [editing, setEditing] = useState<MenuItemListDTO | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItemListDTO | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateQuery(next: Partial<{ q: string; category: string; availability: string; page: string }>) {
    const params = new URLSearchParams({
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.availability ? { availability: filters.availability } : {}),
    });
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    if (!("page" in next)) params.delete("page");
    startNav(() => router.push(`${pathname}?${params.toString()}`));
  }

  function updateSearch(value: string) {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => updateQuery({ q: value }), 350);
  }

  async function handleToggle(item: MenuItemListDTO) {
    startTransition(() => setOptimisticAvailability(item.id));
    await toggleAvailabilityAction(item.id, !item.isAvailable);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    await softDeleteMenuItemAction(deleteTarget.id);
    setDeletePending(false);
    setDeleteTarget(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const editingItem = editing && editing !== "new" ? editing : null;

  return (
    <div className="flex h-full flex-col p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">
          {dict.menu.title}
        </h1>
        {canManage && (
          <Button onClick={() => setEditing("new")}>{dict.menu.newDish}</Button>
        )}
      </div>

      <div className="mb-md flex flex-wrap items-center gap-[10px]">
        <input
          defaultValue={filters.q}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder={dict.menu.searchPlaceholder}
          className="w-[240px] rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary"
        />
        <select
          value={filters.category}
          onChange={(e) => updateQuery({ category: e.target.value })}
          className="rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface"
        >
          <option value="">{dict.menu.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filters.availability}
          onChange={(e) => updateQuery({ availability: e.target.value })}
          className="rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface"
        >
          <option value="">{dict.menu.allAvailability}</option>
          <option value="available">{dict.menu.available}</option>
          <option value="unavailable">{dict.menu.unavailable}</option>
        </select>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="w-[56px] px-md py-[10px]" />
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.menu.columnDish}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.menu.columnCategory}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.menu.columnPrice}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.menu.columnAvailable}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.menu.columnTags}
              </th>
              {canManage && <th className="px-md py-[10px]" />}
            </tr>
          </thead>
          <tbody>
            {optimisticItems.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-md py-xl text-center text-on-surface-muted">
                  {dict.menu.noResults}
                </td>
              </tr>
            )}
            {optimisticItems.map((item, index) => (
              <tr
                key={item.id}
                className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-md py-[8px]">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-9 w-9 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-sm bg-surface-subtle" />
                  )}
                </td>
                <td className="px-md py-[8px] font-medium text-on-surface">
                  {item.name}
                  {item.missingLocales.length > 0 && (
                    <span className="ml-[8px]">
                      <StatusBadge variant="warning">
                        {dict.menu.missingTranslation.replace(
                          "{locale}",
                          item.missingLocales.join(", ").toUpperCase()
                        )}
                      </StatusBadge>
                    </span>
                  )}
                </td>
                <td className="px-md py-[8px] text-on-surface-muted">{item.categoryName}</td>
                <td className="px-md py-[8px] text-on-surface">${item.basePrice}</td>
                <td className="px-md py-[8px]">
                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    role="switch"
                    aria-checked={item.isAvailable}
                    className={`relative h-[20px] w-[36px] rounded-full transition-colors ${
                      item.isAvailable ? "bg-success" : "bg-border"
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-surface transition-all ${
                        item.isAvailable ? "left-[18px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-md py-[8px]">
                  <div className="flex flex-wrap gap-[4px]">
                    {item.tags.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full border border-border bg-surface-subtle px-[8px] py-[2px] text-[11px] text-on-surface-muted"
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                </td>
                {canManage && (
                  <td className="px-md py-[8px] text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean"
                    >
                      {dict.menu.editDish}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-sm px-[10px] py-[6px] text-[13px] text-error hover:bg-error/10"
                    >
                      {dict.common.delete}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border bg-surface-subtle px-md py-[10px]">
          <span className="text-[12px] text-on-surface-muted">
            {total} {dict.menu.title}
          </span>
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateQuery({ page: String(page - 1) })}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border text-[12px] text-on-surface-muted disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-[12px] text-on-surface-muted">
              {dict.common.page} {page} {dict.common.of} {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => updateQuery({ page: String(page + 1) })}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border text-[12px] text-on-surface-muted disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {canManage && editing !== null && (
        <ItemEditorDrawer
          key={editingItem?.id ?? "new"}
          onClose={() => setEditing(null)}
          dict={dict}
          defaultLocale={defaultLocale}
          item={editingItem}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          tags={tags}
          modifierGroups={modifierGroups.map((g) => ({ id: g.id, name: g.name }))}
        />
      )}

      {canManage && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          title={deleteTarget ? `${dict.menu.deleteDish} — ${deleteTarget.name}` : dict.menu.deleteDish}
          body={dict.menu.deleteDishConfirmBody}
          confirmLabel={dict.menu.deleteDish}
          cancelLabel={dict.menu.cancel}
          pending={deletePending}
        />
      )}
    </div>
  );
}
