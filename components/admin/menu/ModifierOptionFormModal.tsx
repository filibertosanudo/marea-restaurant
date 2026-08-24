"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { ModifierOptionDTO } from "@/lib/dto/menu";
import {
  createModifierOptionAction,
  updateModifierOptionAction,
  type ModifierFormState,
} from "@/lib/menu/modifier-actions";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[13px] font-medium text-on-surface";

export function ModifierOptionFormModal({
  onClose,
  dict,
  defaultLocale,
  groupId,
  option,
}: {
  onClose: () => void;
  dict: AdminDictionary;
  defaultLocale: Lang;
  groupId: string;
  option: ModifierOptionDTO | null;
}) {
  const isEdit = !!option;
  const action = isEdit ? updateModifierOptionAction : createModifierOptionAction;
  const [state, formAction, pending] = useActionState<ModifierFormState, FormData>(
    action,
    undefined
  );
  const [locale, setLocale] = useState<Lang>(defaultLocale);

  useEffect(() => {
    if (state && "success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal open onClose={onClose} title={isEdit ? dict.modifiers.optionName : dict.modifiers.newOption}>
      <form action={formAction} className="flex flex-col gap-md">
        {isEdit && <input type="hidden" name="id" value={option!.id} />}
        <input type="hidden" name="groupId" value={groupId} />

        <Tabs
          items={[
            { id: "en", label: "EN" },
            { id: "es", label: "ES" },
          ]}
          value={locale}
          onChange={(id) => setLocale(id as Lang)}
        />
        {(["en", "es"] as const).map((l) => (
          <div key={l} className={l === locale ? "" : "hidden"}>
            <label className={labelClass}>
              {dict.modifiers.optionName} ({l.toUpperCase()})
              {l === defaultLocale && <span className="text-error"> *</span>}
            </label>
            <input
              name={`${l}.name`}
              defaultValue={option?.translations[l]?.name ?? ""}
              required={l === defaultLocale}
              className={inputClass}
            />
          </div>
        ))}

        <div>
          <label className={labelClass}>{dict.modifiers.priceDelta}</label>
          <input
            name="priceDelta"
            defaultValue={option?.priceDelta ?? "0.00"}
            inputMode="decimal"
            placeholder="0.00"
            className={inputClass}
          />
        </div>

        <div className="flex gap-lg">
          <label className="flex items-center gap-[8px] text-[13px] text-on-surface">
            <input type="checkbox" name="isAvailable" defaultChecked={option?.isAvailable ?? true} />
            {dict.menu.available}
          </label>
          <label className="flex items-center gap-[8px] text-[13px] text-on-surface">
            <input type="checkbox" name="isDefault" defaultChecked={option?.isDefault ?? false} />
            {dict.modifiers.isDefault}
          </label>
        </div>

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
