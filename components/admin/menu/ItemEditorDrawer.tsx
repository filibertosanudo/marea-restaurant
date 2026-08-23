"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ImageField } from "./ImageField";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { MenuItemListDTO, TagDTO } from "@/lib/dto/menu";
import {
  createMenuItemAction,
  updateMenuItemAction,
  type MenuItemFormState,
} from "@/lib/menu/item-actions";

type ItemEditorDrawerProps = {
  onClose: () => void;
  dict: AdminDictionary;
  defaultLocale: Lang;
  item: MenuItemListDTO | null;
  categories: { id: string; name: string }[];
  tags: TagDTO[];
  modifierGroups: { id: string; name: string }[];
};

export function ItemEditorDrawer({
  onClose,
  dict,
  defaultLocale,
  item,
  categories,
  tags,
  modifierGroups,
}: ItemEditorDrawerProps) {
  const isEdit = !!item;
  const action = isEdit ? updateMenuItemAction : createMenuItemAction;
  const [state, formAction, pending] = useActionState<MenuItemFormState, FormData>(
    action,
    undefined
  );
  const [locale, setLocale] = useState<Lang>(defaultLocale);
  const [selectedTags, setSelectedTags] = useState<string[]>(item?.tagIds ?? []);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    item?.modifierGroupIds ?? []
  );

  useEffect(() => {
    if (state && "success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close backdrop"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
      />
      <div className="relative flex h-full w-full max-w-[480px] flex-col rounded-l-lg bg-surface shadow-hero">
        <div className="flex shrink-0 items-start justify-between border-b border-border px-lg py-md">
          <h2 className="font-display text-[19px] font-semibold text-on-surface">
            {isEdit ? dict.menu.editDish : dict.menu.newDish}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
          >
            ×
          </button>
        </div>

        <form
          action={formAction}
          className="flex flex-1 flex-col overflow-y-auto px-lg py-md"
        >
          {isEdit && <input type="hidden" name="id" value={item!.id} />}

          <div className="flex flex-col gap-md">
            <Tabs
              items={[
                { id: "en", label: "EN" },
                { id: "es", label: "ES" },
              ]}
              value={locale}
              onChange={(id) => setLocale(id as Lang)}
            />

            {(["en", "es"] as const).map((l) => (
              <div key={l} className={l === locale ? "flex flex-col gap-md" : "hidden"}>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.menu.name} ({l.toUpperCase()})
                    {l === defaultLocale && <span className="text-error"> *</span>}
                  </label>
                  <input
                    name={`${l}.name`}
                    defaultValue={item?.translations[l]?.name ?? ""}
                    required={l === defaultLocale}
                    className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
                  />
                </div>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.menu.description} ({l.toUpperCase()})
                  </label>
                  <textarea
                    name={`${l}.description`}
                    defaultValue={item?.translations[l]?.description ?? ""}
                    rows={3}
                    className="w-full resize-none rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
                  />
                </div>
                <div>
                  <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                    {dict.menu.imageAlt} ({l.toUpperCase()})
                  </label>
                  <input
                    name={`${l}.imageAlt`}
                    defaultValue={item?.translations[l]?.imageAlt ?? ""}
                    className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
                  />
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.menu.price} <span className="text-error">*</span>
                </label>
                <input
                  name="basePrice"
                  defaultValue={item?.basePrice ?? ""}
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                  {dict.menu.compareAtPrice}
                </label>
                <input
                  name="compareAtPrice"
                  defaultValue={item?.compareAtPrice ?? ""}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
                {dict.menu.category} <span className="text-error">*</span>
              </label>
              <select
                name="categoryId"
                defaultValue={item?.categoryId ?? categories[0]?.id ?? ""}
                required
                className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <ImageField dict={dict} defaultValue={item?.imageUrl} />

            <div>
              <label className="mb-[6px] block text-[13px] font-medium text-on-surface">
                {dict.menu.tags}
              </label>
              <div className="flex flex-wrap gap-[6px]">
                {tags.map((tag) => {
                  const checked = selectedTags.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className={`cursor-pointer rounded-full border px-[12px] py-[4px] text-[12px] ${
                        checked
                          ? "border-primary bg-surface-ocean text-primary"
                          : "border-border bg-surface-subtle text-on-surface-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="tagIds"
                        value={tag.id}
                        checked={checked}
                        onChange={(e) =>
                          setSelectedTags((prev) =>
                            e.target.checked
                              ? [...prev, tag.id]
                              : prev.filter((id) => id !== tag.id)
                          )
                        }
                        className="sr-only"
                      />
                      {tag.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {modifierGroups.length > 0 && (
              <div>
                <label className="mb-[6px] block text-[13px] font-medium text-on-surface">
                  {dict.menu.modifierGroups}
                </label>
                <div className="flex flex-col gap-[6px]">
                  {modifierGroups.map((group) => {
                    const checked = selectedGroups.includes(group.id);
                    return (
                      <label
                        key={group.id}
                        className="flex items-center gap-[8px] text-[13px] text-on-surface"
                      >
                        <input
                          type="checkbox"
                          name="modifierGroupIds"
                          value={group.id}
                          checked={checked}
                          onChange={(e) =>
                            setSelectedGroups((prev) =>
                              e.target.checked
                                ? [...prev, group.id]
                                : prev.filter((id) => id !== group.id)
                            )
                          }
                        />
                        {group.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex items-center justify-between rounded-sm bg-surface-subtle px-md py-[10px]">
              <span className="text-[13px] font-medium text-on-surface">
                {dict.menu.availableToggle}
              </span>
              <input
                type="checkbox"
                name="isAvailable"
                defaultChecked={item?.isAvailable ?? true}
              />
            </label>

            {state && "error" in state && (
              <p role="alert" className="text-[13px] text-error">
                {dict.common.errorGeneric}
              </p>
            )}
          </div>

          <div className="mt-lg flex shrink-0 justify-end gap-sm border-t border-border pt-md">
            <Button type="button" variant="secondary" onClick={onClose}>
              {dict.menu.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {dict.menu.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
