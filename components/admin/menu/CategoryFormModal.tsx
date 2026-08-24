"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { CategoryListDTO } from "@/lib/dto/menu";
import {
  createCategoryAction,
  updateCategoryAction,
  type CategoryFormState,
} from "@/lib/menu/category-actions";

type CategoryFormModalProps = {
  open: boolean;
  onClose: () => void;
  dict: AdminDictionary;
  defaultLocale: Lang;
  category: CategoryListDTO | null;
};

// Keyed by the caller (see CategoryList) on category?.id ?? "new" so this
// remounts fresh per target — useActionState binds its action function on
// mount, and this component is reused across "new" and "edit" opens without
// otherwise unmounting, which would leave it permanently bound to whichever
// action it first mounted with.
export function CategoryFormModal({
  open,
  onClose,
  dict,
  defaultLocale,
  category,
}: CategoryFormModalProps) {
  const isEdit = !!category;
  const action = isEdit ? updateCategoryAction : createCategoryAction;
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(
    action,
    undefined
  );
  const [locale, setLocale] = useState<Lang>(defaultLocale);

  useEffect(() => {
    if (state && "success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? dict.menu.editCategory : dict.menu.newCategory}
    >
      <form action={formAction} className="flex flex-col gap-md">
        {isEdit && <input type="hidden" name="id" value={category!.id} />}

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
                {dict.menu.categoryName} ({l.toUpperCase()})
                {l === defaultLocale && <span className="text-error"> *</span>}
              </label>
              <input
                name={`${l}.name`}
                defaultValue={category?.translations[l]?.name ?? ""}
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
                defaultValue={category?.translations[l]?.description ?? ""}
                rows={2}
                className="w-full resize-none rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
              />
            </div>
          </div>
        ))}

        <label className="flex items-center gap-[8px] text-[13px] text-on-surface">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category?.isActive ?? true}
          />
          {dict.menu.categoryActive}
        </label>

        {state && "error" in state && (
          <p role="alert" className="text-[13px] text-error">
            {dict.common.errorGeneric}
          </p>
        )}

        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose}>
            {dict.menu.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {dict.menu.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
