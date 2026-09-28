"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { createCategoryAction, type CategoryFormState } from "@/lib/menu/category-actions";
import { createMenuItemAction, type MenuItemFormState } from "@/lib/menu/item-actions";
import { advanceOnboardingAction } from "@/lib/onboarding/actions";
import { WizardChrome } from "./WizardChrome";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[12.5px] font-medium text-on-surface";
const fieldClass = "mb-md";

/** categoryId is only ever the id createCategoryAction just returned, in the
 * same session — never something an admin types, so an item can't be
 * pointed at a category that isn't this business's own. */
function AddDishForm({ dict, defaultLocale, categoryId, onAdded }: { dict: AdminDictionary; defaultLocale: Lang; categoryId: string; onAdded: () => void }) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<MenuItemFormState, FormData>(createMenuItemAction, undefined);

  useEffect(() => {
    if (state && "success" in state) {
      onAdded();
      // A fresh key remounts the form blank — useActionState's own action
      // binds once per mount, and this component is reused for every dish
      // added in a row, the same reason CategoryFormModal keys itself.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the action's own result, not deriving render state.
      setFormKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per successful create, not on every render.
  }, [state]);

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-sm">
      <input type="hidden" name="categoryId" value={categoryId} />
      {/* createMenuItemAction reads a checkbox's presence as "on" — the
       * wizard skips the toggle entirely and simply says every dish it
       * creates is available. */}
      <input type="hidden" name="isAvailable" value="on" />

      <div className={fieldClass}>
        <label className={labelClass}>{dict.menu.name}</label>
        <input name={`${defaultLocale}.name`} required maxLength={120} className={inputClass} />
      </div>
      <div className={fieldClass}>
        <label className={labelClass}>{dict.menu.price}</label>
        <input name="basePrice" required inputMode="decimal" placeholder="0.00" className={inputClass} />
      </div>

      {state && "error" in state && (
        <p role="alert" className="text-[12.5px] text-error">
          {dict.common.errorGeneric}
        </p>
      )}

      <Button type="submit" disabled={pending} variant="secondary" className="w-full">
        {dict.onboarding.addDish}
      </Button>
    </form>
  );
}

export function MenuStep({ dict, defaultLocale }: { dict: AdminDictionary; defaultLocale: Lang }) {
  const router = useRouter();
  const [skipping, startSkip] = useTransition();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dishCount, setDishCount] = useState(0);
  const [categoryState, categoryAction, categoryPending] = useActionState<CategoryFormState, FormData>(
    createCategoryAction,
    undefined
  );

  useEffect(() => {
    if (categoryState && "success" in categoryState && categoryState.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the action's own result, not deriving render state.
      setCategoryId(categoryState.id);
    }
  }, [categoryState]);

  async function finish() {
    await advanceOnboardingAction(5);
    router.push("/admin");
  }

  return (
    <WizardChrome
      dict={dict.onboarding}
      step={4}
      title={dict.onboarding.menuTitle}
      lead={dict.onboarding.menuLead}
      onSkip={() => startSkip(finish)}
      skipping={skipping}
    >
      {!categoryId ? (
        <form action={categoryAction} className="rounded-md border border-border bg-surface p-md">
          <div className={fieldClass}>
            <label className={labelClass}>{dict.onboarding.categoryNameLabel}</label>
            <input
              name={`${defaultLocale}.name`}
              placeholder={dict.onboarding.categoryNamePlaceholder}
              defaultValue={dict.onboarding.categoryNameDefault}
              required
              maxLength={120}
              className={inputClass}
            />
          </div>
          <input type="hidden" name="isActive" value="on" />
          {categoryState && "error" in categoryState && (
            <p role="alert" className="mb-md text-[12.5px] text-error">
              {dict.common.errorGeneric}
            </p>
          )}
          <Button type="submit" disabled={categoryPending} className="w-full">
            {dict.onboarding.addCategory}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-md">
          {dishCount > 0 && (
            <p className="text-[12.5px] text-success">
              {dict.onboarding.dishesAdded.replace("{count}", String(dishCount))}
            </p>
          )}
          <AddDishForm dict={dict} defaultLocale={defaultLocale} categoryId={categoryId} onAdded={() => setDishCount((prev) => prev + 1)} />
          <Button type="button" onClick={finish} className="w-full">
            {dict.onboarding.finishButton}
          </Button>
        </div>
      )}
    </WizardChrome>
  );
}
