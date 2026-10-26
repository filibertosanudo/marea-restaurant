"use client";

import { useActionState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { DemoPersonaKey } from "@/lib/demo/personas";
import { demoLoginAction } from "@/lib/demo/actions";

const PERSONAS: DemoPersonaKey[] = ["owner", "admin", "waiter", "kitchen"];

/** The demo's front door: one button per role, no password to type. */
export function DemoAccess({ dict }: { dict: AdminDictionary["demo"] }) {
  const [state, action, pending] = useActionState(demoLoginAction, undefined);

  return (
    <div className="rounded-lg border border-surface-ocean-border bg-surface p-lg shadow-2">
      <p className="text-[14px] font-semibold text-on-surface">{dict.accessTitle}</p>
      <p className="mt-[4px] text-[12.5px] text-on-surface-muted">{dict.accessLead}</p>
      <form action={action} className="mt-md grid gap-sm">
        {PERSONAS.map((key) => (
          <button
            key={key}
            type="submit"
            name="persona"
            value={key}
            disabled={pending}
            className="flex flex-col items-start rounded-md border border-border px-md py-[10px] text-left transition-colors hover:border-primary hover:bg-surface-ocean disabled:opacity-60"
          >
            <span className="text-[13.5px] font-medium text-on-surface">{dict.personas[key].title}</span>
            <span className="text-[12px] text-on-surface-muted">{dict.personas[key].body}</span>
          </button>
        ))}
      </form>
      {state?.error && (
        <p role="alert" className="mt-sm text-[12.5px] text-error">
          {dict.accessFailed}
        </p>
      )}
    </div>
  );
}
