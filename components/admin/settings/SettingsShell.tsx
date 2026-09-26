"use client";

import { useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { ScheduleEditor, type OpeningHourRow, type ClosureRow } from "./ScheduleEditor";
import { BusinessSettingsForm, type BusinessSettings } from "./BusinessSettingsForm";
import { StripeConnectCard, type StripeCardState } from "./StripeConnectCard";
import { BusinessContentForm, type BusinessContent } from "./BusinessContentForm";
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
  content,
  notificationsDueCount,
  notificationJobs,
  devices,
  stripe,
}: {
  dict: SettingsDict;
  lang: Lang;
  timezone: string;
  openingHours: OpeningHourRow[];
  closures: ClosureRow[];
  business: BusinessSettings;
  content: BusinessContent;
  notificationsDueCount: number;
  notificationJobs: NotificationJobDTO[];
  devices: DeviceDTO[];
  stripe: StripeCardState;
}) {
  const [tab, setTab] = useState<"hours" | "business" | "content" | "notifications" | "devices">(stripe.arrival ? "business" : "hours");

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
          onClick={() => setTab("content")}
          className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
            tab === "content" ? "bg-primary text-on-primary" : "text-on-surface-muted"
          }`}
        >
          {dict.tabContent}
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
      {tab === "business" && (
        <>
          <BusinessSettingsForm dict={dict} business={business} />
          <StripeConnectCard dict={dict} state={stripe} lang={lang} />
        </>
      )}
      {tab === "content" && <BusinessContentForm dict={dict} defaultLocale={lang} content={content} />}
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
