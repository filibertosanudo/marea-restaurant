"use client";

import { useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { ScheduleEditor, type OpeningHourRow, type ClosureRow } from "./ScheduleEditor";
import { BusinessSettingsForm, type BusinessSettings } from "./BusinessSettingsForm";

type SettingsDict = AdminDictionary["settings"];

export function SettingsShell({
  dict,
  lang,
  timezone,
  openingHours,
  closures,
  business,
}: {
  dict: SettingsDict;
  lang: Lang;
  timezone: string;
  openingHours: OpeningHourRow[];
  closures: ClosureRow[];
  business: BusinessSettings;
}) {
  const [tab, setTab] = useState<"hours" | "business">("hours");

  return (
    <div className="p-lg">
      <div className="mb-md">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.title}</h1>
      </div>

      <div className="mb-lg inline-flex rounded-full border border-border bg-surface-subtle p-[3px]">
        <button
          type="button"
          onClick={() => setTab("hours")}
          className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
            tab === "hours" ? "bg-primary text-on-primary" : "text-on-surface-muted"
          }`}
        >
          {dict.tabHours}
        </button>
        <button
          type="button"
          onClick={() => setTab("business")}
          className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
            tab === "business" ? "bg-primary text-on-primary" : "text-on-surface-muted"
          }`}
        >
          {dict.tabBusiness}
        </button>
      </div>

      {tab === "hours" ? (
        <ScheduleEditor dict={dict} lang={lang} timezone={timezone} openingHours={openingHours} closures={closures} />
      ) : (
        <BusinessSettingsForm dict={dict} business={business} />
      )}
    </div>
  );
}
