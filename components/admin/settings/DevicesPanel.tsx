"use client";

import { useActionState, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { toIntlLocale } from "@/lib/dto/money";
import type { DeviceDTO } from "@/lib/devices/dto";
import {
  createDeviceAction,
  rotateDeviceTokenAction,
  setDeviceActiveAction,
  type DeviceFormState,
} from "@/lib/devices/actions";

type DevicesDict = AdminDictionary["settings"]["devices"];

// A device that hasn't polled in a while is worth flagging here too, not
// just on the kitchen screen — thirty times the agent's own poll interval,
// generous margin for a network hiccup before this reads as trouble.
const OFFLINE_AFTER_MS = 60_000;

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < OFFLINE_AFTER_MS;
}

function TokenRevealModal({
  title,
  token,
  lead,
  onClose,
}: {
  title: string;
  token: string;
  lead: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-md">
        <p className="text-[13px] text-on-surface-muted">{lead}</p>
        <p className="select-all break-all rounded-sm bg-surface-subtle px-md py-[10px] font-mono text-[13px] text-on-surface">
          {token}
        </p>
        <div className="mt-sm flex justify-end">
          <Button type="button" onClick={onClose}>
            Ok
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NewDeviceModal({ dict, onClose }: { dict: DevicesDict; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<DeviceFormState, FormData>(createDeviceAction, undefined);

  if (state && "success" in state) {
    return <TokenRevealModal title={dict.newDevice} token={state.token} lead={dict.tokenShownOnce} onClose={onClose} />;
  }

  return (
    <Modal open onClose={onClose} title={dict.newDevice}>
      <form action={formAction} className="flex flex-col gap-md">
        <div>
          <label className="mb-[4px] block text-[13px] font-medium text-on-surface">
            {dict.name} <span className="text-error">*</span>
          </label>
          <input
            name="name"
            required
            placeholder={dict.namePlaceholder}
            className="w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[14px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]"
          />
        </div>

        {state && "error" in state && (
          <p role="alert" className="text-[13px] text-error">
            {dict.errorGeneric}
          </p>
        )}

        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose}>
            {dict.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {dict.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DevicesPanel({ dict, lang, devices }: { dict: DevicesDict; lang: Lang; devices: DeviceDTO[] }) {
  const [items, setItems] = useState(devices);
  const [showNew, setShowNew] = useState(false);
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const locale = toIntlLocale(lang);

  function handleRotate(deviceId: string) {
    setPendingId(deviceId);
    startTransition(async () => {
      const result = await rotateDeviceTokenAction(deviceId);
      if (result.ok) setRotatedToken(result.token);
      setPendingId(null);
    });
  }

  function handleToggleActive(deviceId: string, next: boolean) {
    setPendingId(deviceId);
    startTransition(async () => {
      await setDeviceActiveAction(deviceId, next);
      setItems((prev) => prev.map((d) => (d.id === deviceId ? { ...d, isActive: next } : d)));
      setPendingId(null);
    });
  }

  return (
    <div>
      <div className="mb-md flex items-center justify-between">
        <div>
          <h2 className="font-display text-[17px] font-semibold text-on-surface">{dict.title}</h2>
          <p className="text-[13px] text-on-surface-muted">{dict.lead}</p>
        </div>
        <Button type="button" onClick={() => setShowNew(true)}>
          {dict.newDevice}
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnName}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnStatus}
              </th>
              <th className="px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
                {dict.columnLastSeen}
              </th>
              <th className="px-md py-[10px]" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-md py-lg text-center text-on-surface-muted">
                  {dict.empty}
                </td>
              </tr>
            )}
            {items.map((device, index) => (
              <tr
                key={device.id}
                className={`border-t border-border align-top ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
              >
                <td className="px-md py-[8px] font-medium text-on-surface">{device.name}</td>
                <td className="px-md py-[8px]">
                  {!device.isActive ? (
                    <StatusBadge variant="neutral">{dict.statusInactive}</StatusBadge>
                  ) : isOnline(device.lastSeenAt) ? (
                    <StatusBadge variant="success">{dict.statusOnline}</StatusBadge>
                  ) : (
                    <StatusBadge variant="error">{dict.statusOffline}</StatusBadge>
                  )}
                </td>
                <td className="px-md py-[8px] text-on-surface-muted">
                  {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString(locale) : dict.neverSeen}
                </td>
                <td className="px-md py-[8px] text-right">
                  <button
                    type="button"
                    onClick={() => handleRotate(device.id)}
                    disabled={isPending && pendingId === device.id}
                    className="rounded-sm px-[10px] py-[6px] text-[13px] text-primary hover:bg-surface-ocean disabled:opacity-50"
                  >
                    {dict.rotateToken}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(device.id, !device.isActive)}
                    disabled={isPending && pendingId === device.id}
                    className="rounded-sm px-[10px] py-[6px] text-[13px] text-on-surface-muted hover:bg-surface-subtle disabled:opacity-50"
                  >
                    {device.isActive ? dict.deactivate : dict.reactivate}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewDeviceModal dict={dict} onClose={() => setShowNew(false)} />}
      {rotatedToken && (
        <TokenRevealModal
          title={dict.rotateToken}
          token={rotatedToken}
          lead={dict.tokenShownOnce}
          onClose={() => setRotatedToken(null)}
        />
      )}
    </div>
  );
}
