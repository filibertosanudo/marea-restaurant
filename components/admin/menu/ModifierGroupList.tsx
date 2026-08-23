"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ModifierGroupFormModal } from "./ModifierGroupFormModal";
import { ModifierOptionFormModal } from "./ModifierOptionFormModal";
import type { Lang } from "@/lib/i18n/lang";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { ModifierGroupDTO, ModifierOptionDTO } from "@/lib/dto/menu";
import {
  deleteModifierGroupAction,
  deleteModifierOptionAction,
} from "@/lib/menu/modifier-actions";

export function ModifierGroupList({
  groups,
  dict,
  defaultLocale,
}: {
  groups: ModifierGroupDTO[];
  dict: AdminDictionary;
  defaultLocale: Lang;
}) {
  const [editingGroup, setEditingGroup] = useState<ModifierGroupDTO | "new" | null>(null);
  const [optionTarget, setOptionTarget] = useState<{
    groupId: string;
    option: ModifierOptionDTO | "new";
  } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<ModifierGroupDTO | null>(null);
  const [deleteOption, setDeleteOption] = useState<{ groupId: string; option: ModifierOptionDTO } | null>(
    null
  );
  const [blockedGroupId, setBlockedGroupId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const editingGroupDTO = editingGroup && editingGroup !== "new" ? editingGroup : null;
  const editingOptionDTO =
    optionTarget && optionTarget.option !== "new" ? optionTarget.option : null;

  async function handleDeleteGroup() {
    if (!deleteGroup) return;
    setPending(true);
    const result = await deleteModifierGroupAction(deleteGroup.id);
    setPending(false);
    if (result.blocked) {
      setBlockedGroupId(deleteGroup.id);
      setDeleteGroup(null);
      return;
    }
    setDeleteGroup(null);
  }

  async function handleDeleteOption() {
    if (!deleteOption) return;
    setPending(true);
    await deleteModifierOptionAction(deleteOption.option.id);
    setPending(false);
    setDeleteOption(null);
  }

  return (
    <div className="p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">
          {dict.modifiers.title}
        </h1>
        <Button onClick={() => setEditingGroup("new")}>{dict.modifiers.newGroup}</Button>
      </div>

      {groups.length === 0 && (
        <p className="text-[13px] text-on-surface-muted">{dict.modifiers.noGroupsYet}</p>
      )}

      <div className="flex flex-col gap-md">
        {groups.map((group) => (
          <div key={group.id} className="overflow-hidden rounded-md border border-border bg-surface">
            {blockedGroupId === group.id && (
              <div className="border-b border-border bg-warning/10 px-md py-[8px] text-[12px] text-warning">
                {dict.modifiers.deleteGroupBlocked}
              </div>
            )}
            <div className="flex items-center gap-md border-b border-border bg-surface-subtle px-md py-[10px]">
              <span className="flex-1 text-[14px] font-medium text-on-surface">
                {group.name}
                {group.missingLocales.length > 0 && (
                  <span className="ml-[8px]">
                    <StatusBadge variant="warning">
                      {dict.menu.missingTranslation.replace(
                        "{locale}",
                        group.missingLocales.join(", ").toUpperCase()
                      )}
                    </StatusBadge>
                  </span>
                )}
              </span>
              <span className="text-[12px] text-on-surface-muted">
                {group.selectionType === "SINGLE"
                  ? dict.modifiers.selectionSingle
                  : dict.modifiers.selectionMultiple}
              </span>
              <span className="text-[12px] text-on-surface-muted">
                {dict.modifiers.appliedToCount.replace("{count}", String(group.appliedToCount))}
              </span>
              <button
                type="button"
                onClick={() => setEditingGroup(group)}
                className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean"
              >
                {dict.common.edit}
              </button>
              <button
                type="button"
                onClick={() => setDeleteGroup(group)}
                className="rounded-sm px-[10px] py-[6px] text-[13px] text-error hover:bg-error/10"
              >
                {dict.common.delete}
              </button>
            </div>

            <div className="flex flex-col">
              {group.options.map((option, index) => (
                <div
                  key={option.id}
                  className={`flex items-center gap-md px-md py-[8px] text-[13px] ${
                    index % 2 === 1 ? "bg-surface-raised" : "bg-surface"
                  }`}
                >
                  <span className="flex-1 text-on-surface">
                    {option.name}
                    {option.missingLocales.length > 0 && (
                      <span className="ml-[8px]">
                        <StatusBadge variant="warning">
                          {dict.menu.missingTranslation.replace(
                            "{locale}",
                            option.missingLocales.join(", ").toUpperCase()
                          )}
                        </StatusBadge>
                      </span>
                    )}
                  </span>
                  <span className="text-on-surface-muted">
                    {Number(option.priceDelta) >= 0 ? "+" : ""}
                    {option.priceDelta}
                  </span>
                  {!option.isAvailable && (
                    <StatusBadge variant="neutral">{dict.menu.unavailable}</StatusBadge>
                  )}
                  <button
                    type="button"
                    onClick={() => setOptionTarget({ groupId: group.id, option })}
                    className="rounded-sm px-[8px] py-[4px] text-[12px] text-primary hover:bg-surface-ocean"
                  >
                    {dict.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOption({ groupId: group.id, option })}
                    className="rounded-sm px-[8px] py-[4px] text-[12px] text-error hover:bg-error/10"
                  >
                    {dict.common.delete}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptionTarget({ groupId: group.id, option: "new" })}
                className="px-md py-[8px] text-left text-[13px] text-primary hover:bg-surface-ocean"
              >
                + {dict.modifiers.newOption}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingGroup !== null && (
        <ModifierGroupFormModal
          key={editingGroupDTO?.id ?? "new-group"}
          onClose={() => setEditingGroup(null)}
          dict={dict}
          defaultLocale={defaultLocale}
          group={editingGroupDTO}
        />
      )}

      {optionTarget !== null && (
        <ModifierOptionFormModal
          key={editingOptionDTO?.id ?? `new-option-${optionTarget.groupId}`}
          onClose={() => setOptionTarget(null)}
          dict={dict}
          defaultLocale={defaultLocale}
          groupId={optionTarget.groupId}
          option={editingOptionDTO}
        />
      )}

      <ConfirmDialog
        open={deleteGroup !== null}
        onClose={() => setDeleteGroup(null)}
        onConfirm={handleDeleteGroup}
        title={deleteGroup ? `${dict.common.delete} — ${deleteGroup.name}` : dict.common.delete}
        body={dict.modifiers.deleteGroupConfirmBody}
        confirmLabel={dict.common.delete}
        cancelLabel={dict.menu.cancel}
        pending={pending}
      />

      <ConfirmDialog
        open={deleteOption !== null}
        onClose={() => setDeleteOption(null)}
        onConfirm={handleDeleteOption}
        title={deleteOption ? `${dict.common.delete} — ${deleteOption.option.name}` : dict.common.delete}
        body={dict.modifiers.deleteOptionConfirmBody}
        confirmLabel={dict.common.delete}
        cancelLabel={dict.menu.cancel}
        pending={pending}
      />
    </div>
  );
}
