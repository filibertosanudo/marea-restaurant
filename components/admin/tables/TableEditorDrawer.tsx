"use client";

import { useActionState, useEffect, useState } from "react";
import { Drawer } from "@/components/admin/Drawer";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import {
  createTableAction,
  createTablesBatchAction,
  updateTableAction,
  type TableFormState,
} from "@/lib/tables/actions";

type TableRow = { id: string; code: string; zone: string | null; seats: number };
type TableDict = AdminDictionary["tables"];

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[12.5px] font-medium text-on-surface";
const fieldClass = "mb-md";

function errorMessage(dict: TableDict, code: string | undefined): string | null {
  switch (code) {
    case undefined:
      return null;
    case "code_taken":
      return dict.errorCodeTaken;
    case "not_found":
      return dict.errorNotFound;
    case "invalid":
      return dict.errorInvalid;
    default:
      return dict.errorGeneric;
  }
}

/**
 * Keyed by the caller on table?.id ?? "new" (same reason CategoryFormModal
 * is) — useActionState binds its action on mount, so reusing one instance
 * across "new" and "edit" opens would leave it bound to whichever it first
 * mounted with.
 */
export function TableEditorDrawer({
  open,
  onClose,
  dict,
  table,
}: {
  open: boolean;
  onClose: () => void;
  dict: TableDict;
  table: TableRow | null;
}) {
  const isEdit = !!table;
  const [mode, setMode] = useState<"lote" | "individual">("lote");
  const action = isEdit ? updateTableAction : mode === "lote" ? createTablesBatchAction : createTableAction;
  const [state, formAction, pending] = useActionState<TableFormState, FormData>(action, undefined);

  useEffect(() => {
    if (state && "success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldError = (name: string) => (state && "fieldErrors" in state ? state.fieldErrors?.[name] : undefined);

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? dict.drawerEditTitle : dict.drawerNewTitle}>
      {!isEdit && (
        <p className="mb-lg text-[12.5px] text-on-surface-muted">{dict.drawerLead}</p>
      )}

      {!isEdit && (
        <div className="mb-lg flex gap-sm">
          <Button
            type="button"
            variant={mode === "lote" ? "primary" : "secondary"}
            className="flex-1 !px-md !py-[8px] !text-[13px]"
            onClick={() => setMode("lote")}
          >
            {dict.modeLote}
          </Button>
          <Button
            type="button"
            variant={mode === "individual" ? "primary" : "secondary"}
            className="flex-1 !px-md !py-[8px] !text-[13px]"
            onClick={() => setMode("individual")}
          >
            {dict.modeIndividual}
          </Button>
        </div>
      )}

      <form action={formAction} className="flex flex-col">
        {isEdit && <input type="hidden" name="id" value={table.id} />}

        {isEdit ? (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.codeLabel}</label>
              <input name="code" defaultValue={table.code} required maxLength={20} className={inputClass} />
              {fieldError("code") && <p className="mt-[4px] text-[12px] text-error">{errorMessage(dict, fieldError("code"))}</p>}
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.zoneLabel}</label>
              <input name="zone" defaultValue={table.zone ?? ""} placeholder={dict.zonePlaceholder} maxLength={40} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.seatsLabel}</label>
              <input name="seats" type="number" defaultValue={table.seats} min={1} max={50} required className={inputClass} />
            </div>
          </>
        ) : mode === "lote" ? (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.zoneLabel}</label>
              <input name="zone" placeholder={dict.zonePlaceholder} maxLength={40} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.quantityLabel}</label>
              <input name="quantity" type="number" defaultValue={4} min={1} max={50} required className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.seatsPerTableLabel}</label>
              <input name="seats" type="number" defaultValue={4} min={1} max={50} required className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.codePrefixLabel}</label>
              <input name="codePrefix" defaultValue="M-" required maxLength={10} className={inputClass} />
            </div>
          </>
        ) : (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.codeLabel}</label>
              <input name="code" placeholder="M-13" required maxLength={20} className={inputClass} />
              {fieldError("code") && <p className="mt-[4px] text-[12px] text-error">{errorMessage(dict, fieldError("code"))}</p>}
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.zoneLabel}</label>
              <input name="zone" placeholder={dict.zonePlaceholder} maxLength={40} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.seatsLabel}</label>
              <input name="seats" type="number" defaultValue={4} min={1} max={50} required className={inputClass} />
            </div>
          </>
        )}

        {state && "error" in state && !fieldError("code") && (
          <p role="alert" className="mb-md text-[13px] text-error">
            {errorMessage(dict, state.error)}
          </p>
        )}

        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose}>
            {dict.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {isEdit ? dict.save : dict.create}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
