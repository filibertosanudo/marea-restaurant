"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TeamMemberFormModal } from "./TeamMemberFormModal";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { TeamMemberDTO } from "@/lib/dto/team";
import { setTeamMemberActiveAction, setTeamMemberRoleAction, type TeamMutationResult } from "@/lib/team/actions";

export function TeamMemberList({
  members,
  currentUserId,
  dict,
}: {
  members: TeamMemberDTO[];
  currentUserId: string;
  dict: AdminDictionary;
}) {
  const [items, setItems] = useState(members);
  const [showForm, setShowForm] = useState(false);
  const [target, setTarget] = useState<TeamMemberDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errorMessage(result: Extract<TeamMutationResult, { ok: false }>): string {
    return result.error === "last_admin" ? dict.team.lastAdminError : dict.team.genericMutationError;
  }

  async function handleConfirmToggle() {
    if (!target) return;
    setPending(true);
    const result = await setTeamMemberActiveAction(target.membershipId, !target.isActive);
    setPending(false);
    if (result.ok) {
      setError(null);
      setItems((prev) =>
        prev.map((m) =>
          m.membershipId === target.membershipId ? { ...m, isActive: !m.isActive } : m
        )
      );
    } else {
      setError(errorMessage(result));
    }
    setTarget(null);
  }

  async function handleRoleChange(member: TeamMemberDTO, role: "STAFF" | "BUSINESS_ADMIN") {
    const result = await setTeamMemberRoleAction(member.membershipId, role);
    if (result.ok) {
      setError(null);
      setItems((prev) => prev.map((m) => (m.membershipId === member.membershipId ? { ...m, role } : m)));
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <div className="p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">
          {dict.team.title}
        </h1>
        <Button onClick={() => setShowForm(true)}>{dict.team.newMember}</Button>
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mb-md rounded-md bg-error/10 px-md py-[10px] text-[13px] text-error"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.team.name}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.team.email}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.team.role}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.team.status}
              </th>
              <th className="px-md py-[10px]" />
            </tr>
          </thead>
          <tbody>
            {items.map((member, index) => (
              <tr
                key={member.membershipId}
                className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-md py-[8px] font-medium text-on-surface">{member.name}</td>
                <td className="px-md py-[8px] text-on-surface-muted">{member.email}</td>
                <td className="px-md py-[8px] text-on-surface-muted">
                  {member.userId === currentUserId ? (
                    member.role === "BUSINESS_ADMIN" ? dict.team.roleAdmin : dict.team.roleStaff
                  ) : (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(member, e.target.value as "STAFF" | "BUSINESS_ADMIN")
                      }
                      className="rounded-sm border border-border bg-surface px-sm py-[4px] text-[13px]"
                    >
                      <option value="STAFF">{dict.team.roleStaff}</option>
                      <option value="BUSINESS_ADMIN">{dict.team.roleAdmin}</option>
                    </select>
                  )}
                </td>
                <td className="px-md py-[8px]">
                  <StatusBadge variant={member.isActive ? "success" : "neutral"}>
                    {member.isActive ? dict.team.active : dict.team.inactive}
                  </StatusBadge>
                </td>
                <td className="px-md py-[8px] text-right">
                  {member.userId !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => setTarget(member)}
                      className={`rounded-sm px-[10px] py-[6px] text-[13px] ${
                        member.isActive
                          ? "text-error hover:bg-error/10"
                          : "text-primary hover:bg-surface-ocean"
                      }`}
                    >
                      {member.isActive ? dict.team.deactivate : dict.team.active}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <TeamMemberFormModal onClose={() => setShowForm(false)} dict={dict} />}

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirmToggle}
        title={target ? `${dict.team.deactivate} — ${target.name}` : dict.team.deactivate}
        body={dict.team.deactivateConfirm}
        confirmLabel={target?.isActive ? dict.team.deactivate : dict.team.active}
        cancelLabel={dict.menu.cancel}
        destructive={target?.isActive ?? true}
        pending={pending}
      />
    </div>
  );
}
