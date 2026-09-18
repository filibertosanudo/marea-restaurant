"use client";

import { useActionState, useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { Button } from "@/components/ui/Button";
import { updateBusinessTranslationAction, type SettingsFormState } from "@/lib/settings/actions";

type SettingsDict = AdminDictionary["settings"];

export type BusinessContentByLocale = {
  tagline: string;
  shortBlurb: string;
  aboutTitle: string;
  aboutBody: string;
};

export type BusinessContent = Record<Lang, BusinessContentByLocale>;

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-[12px] py-[8px] text-[13px] text-on-surface outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(27,54,123,0.15)]";
const labelClass = "mb-[4px] block text-[12.5px] font-medium text-on-surface";
const fieldClass = "mb-md";
const cardClass = "mb-md rounded-md border border-border bg-surface p-md";

export function BusinessContentForm({
  dict,
  defaultLocale,
  content,
}: {
  dict: SettingsDict;
  defaultLocale: Lang;
  content: BusinessContent;
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    updateBusinessTranslationAction,
    undefined
  );
  const [locale, setLocale] = useState<Lang>(defaultLocale);

  return (
    <form action={formAction}>
      <div className={cardClass}>
        <h2 className="mb-[2px] text-[16px] font-semibold text-on-surface">{dict.contentAboutTitle}</h2>
        <p className="mb-md text-[12px] text-on-surface-muted">{dict.contentAboutLead}</p>

        <div className="mb-md inline-flex rounded-full border border-border bg-surface-subtle p-[3px]">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
                locale === l ? "bg-primary text-on-primary" : "text-on-surface-muted"
              }`}
            >
              {l === "es" ? "Español" : "English"}
            </button>
          ))}
        </div>

        {(["es", "en"] as const).map((l) => (
          <div key={l} className={l === locale ? "" : "hidden"}>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.taglineLabel}</label>
              <input
                type="text"
                name={`${l}.tagline`}
                defaultValue={content[l].tagline}
                placeholder={dict.taglineHint}
                className={inputClass}
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.shortBlurbLabel}</label>
              <input type="text" name={`${l}.shortBlurb`} defaultValue={content[l].shortBlurb} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.aboutTitleLabel}</label>
              <input type="text" name={`${l}.aboutTitle`} defaultValue={content[l].aboutTitle} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>{dict.aboutBodyLabel}</label>
              <textarea name={`${l}.aboutBody`} defaultValue={content[l].aboutBody} rows={4} className={inputClass} />
            </div>
          </div>
        ))}
      </div>

      {state && "error" in state && (
        <p role="alert" className="mb-md text-[13px] text-error">
          {dict.errorGeneric}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {dict.saveContent}
        </Button>
      </div>
    </form>
  );
}
