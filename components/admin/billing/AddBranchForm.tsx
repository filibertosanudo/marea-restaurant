"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { addBranchAction } from "@/lib/billing/branch-actions";

/**
 * The owner's "add a branch" form. When the plan's limit is reached it still
 * renders, with the reason and the way out, rather than a hidden button: the
 * limit is the server's to enforce, and the owner should know it exists.
 */
export function AddBranchForm({
  dict,
  planName,
  max,
  atLimit,
}: {
  dict: AdminDictionary["billing"];
  planName: string | null;
  max: number | null;
  atLimit: boolean;
}) {
  const [state, action, pending] = useActionState(addBranchAction, undefined);
  const limitText = dict.branchLimit.replace("{plan}", planName ?? "").replace("{max}", String(max ?? ""));

  const error =
    state && !state.ok
      ? state.error === "branch_limit"
        ? limitText
        : state.error === "slug_taken"
          ? dict.branchSlugTaken
          : state.error === "unverified_organization"
            ? dict.branchUnverified
            : dict.branchInvalid
      : null;

  if (atLimit && !(state && state.ok)) {
    return <p className="text-[13px] text-on-surface">{limitText}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-md">
      <div className="grid gap-md sm:grid-cols-2">
        <Input id="branch-name" name="name" label={dict.branchName} required maxLength={120} />
        <Input id="branch-slug" name="slug" label={dict.branchSlug} required maxLength={32} pattern="[a-z0-9-]+" />
      </div>
      <p className="text-[12px] text-on-surface-muted">{dict.branchSlugHint}</p>
      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-[13px] text-on-surface">
          {dict.branchAdded.replace("{slug}", state.slug)}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {dict.addBranch}
        </Button>
      </div>
    </form>
  );
}
