"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireRole } from "@/lib/auth/permissions";
import { validateSlug } from "@/lib/business-host";
import { organizationOwner } from "@/lib/billing/owner";
import { atBranchLimit, branchAllowance } from "@/lib/billing/limits";
import { PLANS, quantityFor, type PlanId } from "@/lib/billing/plans";
import { billingEnabled, setSubscriptionQuantity } from "@/lib/stripe/billing";
import { branchSqlError } from "@/lib/tenants/signup-errors";

const branchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const problem = validateSlug(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
});

export type AddBranchState =
  | { ok: true; slug: string }
  | { ok: false; error: "invalid_input" | "slug_taken" | "branch_limit" | "unverified_organization"; plan?: PlanId | null; fieldErrors?: Record<string, string> }
  | undefined;

/**
 * Adds a branch to the owner's organization (module 19, phase 7). The plan's
 * limit is checked here, to answer with the plan's name, and again inside
 * marea_add_branch with the organization locked, which is what holds when two
 * requests race. On a per-branch plan the subscription's quantity follows; a
 * failure there is logged and the next billing event reconciles it
 * (lib/billing/webhook.ts), never a reason to undo the branch.
 */
export async function addBranchAction(_prev: AddBranchState, formData: FormData): Promise<AddBranchState> {
  const owner = await organizationOwner(await requireRole(UserRole.BUSINESS_ADMIN));

  const parsed = branchSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const allowance = await branchAllowance(owner.organizationId);
  if (atBranchLimit(allowance)) return { ok: false, error: "branch_limit", plan: allowance.plan };

  const businessId = createId();
  try {
    await prisma.$executeRaw`SELECT marea_add_branch(${businessId}, ${parsed.data.slug}, ${parsed.data.name}, ${createId()}, ${createId()}, ${allowance.max}::integer)`;
  } catch (err) {
    const reason = branchSqlError(err);
    if (reason === "slug_taken") return { ok: false, error: "slug_taken" };
    if (reason === "branch_limit") return { ok: false, error: "branch_limit", plan: allowance.plan };
    if (reason === "unverified_organization") return { ok: false, error: "unverified_organization" };
    if (reason === "invalid_slug" || reason === "reserved_slug") return { ok: false, error: "invalid_input", fieldErrors: { slug: reason } };
    throw err;
  }

  if (allowance.plan && PLANS[allowance.plan].perBusiness && allowance.stripeSubscriptionId && billingEnabled()) {
    try {
      await setSubscriptionQuantity(allowance.stripeSubscriptionId, quantityFor(allowance.plan, allowance.count + 1));
    } catch (err) {
      console.error(`[billing] branch added to ${owner.organizationId} but its quantity was not updated`, err);
    }
  }

  // The business switcher in the shell lists the new branch.
  revalidatePath("/admin", "layout");
  return { ok: true, slug: parsed.data.slug };
}
