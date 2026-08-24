"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { ModifierGroupDTO } from "@/lib/dto/menu";
import {
  createModifierGroupAction,
  updateModifierGroupAction,
  type ModifierFormState,
} from "@/lib/menu/modifier-actions";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[13px] font-medium text-on-surface";

export function ModifierGroupFormModal({
  onClose,
  dict,
  defaultLocale,
  group,
}: {
  onClose: () => void;
  dict: AdminDictionary;
  defaultLocale: Lang;
  group: ModifierGroupDTO | null;
}) {
  const isEdit = !!group;
  const action = isEdit ? updateModifierGroupAction : createModifierGroupAction;
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
    <Modal open onClose={onClose} title={isEdit ? dict.modifiers.editGroup : dict.modifiers.newGroup}>
      <form action={formAction} className="flex flex-col gap-md">
        {isEdit && <input type="hidden" name="id" value={group!.id} />}

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
              {dict.modifiers.groupName} ({l.toUpperCase()})
              {l === defaultLocale && <span className="text-error"> *</span>}
            </label>
            <input
              name={`${l}.name`}
              defaultValue={group?.translations[l]?.name ?? ""}
              required={l === defaultLocale}
              className={inputClass}
            />
          </div>
        ))}

        <div>
          <label className={labelClass}>{dict.menu.description}</label>
          <input name="helpText" defaultValue={group?.helpText ?? ""} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelClass}>{dict.modifiers.selectionType}</label>
            <select
              name="selectionType"
              defaultValue={group?.selectionType ?? "SINGLE"}
              className={inputClass}
            >
              <option value="SINGLE">{dict.modifiers.selectionSingle}</option>
              <option value="MULTIPLE">{dict.modifiers.selectionMultiple}</option>
            </select>
          </div>
          <label className="flex items-end gap-[8px] pb-[10px] text-[13px] text-on-surface">
            <input type="checkbox" name="isRequired" defaultChecked={group?.isRequired ?? false} />
            {dict.modifiers.required}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className={labelClass}>{dict.modifiers.minSelections}</label>
            <input
              name="minSelections"
              type="number"
              min={0}
              defaultValue={group?.minSelections ?? 0}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{dict.modifiers.maxSelections}</label>
            <input
              name="maxSelections"
              type="number"
              min={1}
              defaultValue={group?.maxSelections ?? ""}
              className={inputClass}
            />
          </div>
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
