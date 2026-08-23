"use client";

import { useActionState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { createTeamMemberAction, type TeamFormState } from "@/lib/team/actions";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[13px] font-medium text-on-surface";

export function TeamMemberFormModal({
  onClose,
  dict,
}: {
  onClose: () => void;
  dict: AdminDictionary;
}) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(
    createTeamMemberAction,
    undefined
  );

  if (state && "success" in state) {
    return (
      <Modal open onClose={onClose} title={dict.team.newMember}>
        <div className="flex flex-col gap-md">
          <p className="text-[13px] text-on-surface-muted">{dict.team.temporaryPassword}:</p>
          <p className="select-all rounded-sm bg-surface-subtle px-md py-[10px] font-mono text-[15px] text-on-surface">
            {state.temporaryPassword}
          </p>
          <p className="text-[12px] text-on-surface-muted">
            {dict.common.confirm} — {dict.auth.mustChangePasswordBody}
          </p>
          <div className="mt-sm flex justify-end">
            <Button type="button" onClick={onClose}>
              {dict.menu.save}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={dict.team.newMember}>
      <form action={formAction} className="flex flex-col gap-md">
        <div>
          <label className={labelClass}>
            {dict.team.name} <span className="text-error">*</span>
          </label>
          <input name="name" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            {dict.team.email} <span className="text-error">*</span>
          </label>
          <input name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{dict.team.role}</label>
          <select name="role" defaultValue="STAFF" className={inputClass}>
            <option value="STAFF">{dict.team.roleStaff}</option>
            <option value="BUSINESS_ADMIN">{dict.team.roleAdmin}</option>
          </select>
        </div>

        {state && "error" in state && (
          <p role="alert" className="text-[13px] text-error">
            {state.error === "email_taken" ? state.fieldErrors?.email : dict.common.errorGeneric}
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
