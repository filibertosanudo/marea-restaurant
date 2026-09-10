"use client";

import { useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { ScheduleEditor, type OpeningHourRow, type ClosureRow } from "./ScheduleEditor";
import { BusinessSettingsForm, type BusinessSettings } from "./BusinessSettingsForm";
import { NotificationQueuePanel } from "./NotificationQueuePanel";
import { DevicesPanel } from "./DevicesPanel";
import type { NotificationJobDTO } from "@/lib/notifications/dto";
import type { DeviceDTO } from "@/lib/devices/dto";

type SettingsDict = AdminDictionary["settings"];

export function SettingsShell({
  dict,
  lang,
  timezone,
  openingHours,
  closures,
  business,
  notificationsDueCount,
  notificationJobs,
  devices,
}: {
  dict: SettingsDict;
  lang: Lang;
  timezone: string;
  openingHours: OpeningHourRow[];
  closures: ClosureRow[];
  business: BusinessSettings;
  notificationsDueCount: number;
  notificationJobs: NotificationJobDTO[];
  devices: DeviceDTO[];
}) {
  const [tab, setTab] = useState<"hours" | "business" | "notifications" | "devices">("hours");

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
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
            tab === "notifications" ? "bg-primary text-on-primary" : "text-on-surface-muted"
          }`}
        >
          {dict.tabNotifications}
        </button>
        <button
          type="button"
          onClick={() => setTab("devices")}
          className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
            tab === "devices" ? "bg-primary text-on-primary" : "text-on-surface-muted"
          }`}
        >
          {dict.tabDevices}
        </button>
      </div>

      {tab === "hours" && (
        <ScheduleEditor dict={dict} lang={lang} timezone={timezone} openingHours={openingHours} closures={closures} />
      )}
      {tab === "business" && <BusinessSettingsForm dict={dict} business={business} />}
      {tab === "notifications" && (
        <NotificationQueuePanel
          dict={dict.notifications}
          lang={lang}
          dueCount={notificationsDueCount}
          jobs={notificationJobs}
        />
      )}
      {tab === "devices" && <DevicesPanel dict={dict.devices} lang={lang} devices={devices} />}
    </div>
  );
}
