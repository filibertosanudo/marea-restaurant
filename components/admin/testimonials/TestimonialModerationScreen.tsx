"use client";

import { useState } from "react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import type { TestimonialModerationDTO } from "@/lib/dto/testimonials";
import {
  approveTestimonialAction,
  rejectTestimonialAction,
  toggleFeaturedTestimonialAction,
  reorderTestimonialsAction,
} from "@/lib/testimonials/actions";

type Tab = "PENDING" | "APPROVED" | "REJECTED";

type TestimonialModerationScreenProps = {
  pending: TestimonialModerationDTO[];
  approved: TestimonialModerationDTO[];
  rejected: TestimonialModerationDTO[];
  dict: AdminDictionary;
  lang: Lang;
};

function formatDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden className="text-[12px] tracking-[1px] text-warning">
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

export function TestimonialModerationScreen({
  pending: initialPending,
  approved: initialApproved,
  rejected,
  dict,
  lang,
}: TestimonialModerationScreenProps) {
  const t = dict.testimonials;
  const [tab, setTab] = useState<Tab>("PENDING");
  const [pending, setPending] = useState(initialPending);
  const [approved, setApproved] = useState(initialApproved);
  const [dragId, setDragId] = useState<string | null>(null);

  async function handleApprove(item: TestimonialModerationDTO) {
    setPending((prev) => prev.filter((p) => p.id !== item.id));
    setApproved((prev) => [...prev, item]);
    const result = await approveTestimonialAction(item.id);
    if ("error" in result) {
      // Another admin already acted on this row (approved, rejected, or
      // deleted it) between the click and this response — undo the
      // optimistic move instead of showing a row that isn't really approved.
      setApproved((prev) => prev.filter((p) => p.id !== item.id));
      setPending((prev) => [item, ...prev]);
    }
  }

  async function handleReject(item: TestimonialModerationDTO) {
    setPending((prev) => prev.filter((p) => p.id !== item.id));
    const result = await rejectTestimonialAction(item.id);
    if ("error" in result) {
      setPending((prev) => [item, ...prev]);
    }
  }

  async function handleToggleFeatured(item: TestimonialModerationDTO) {
    setApproved((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isFeatured: !p.isFeatured } : p))
    );
    const result = await toggleFeaturedTestimonialAction(item.id, !item.isFeatured);
    if ("error" in result) {
      setApproved((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, isFeatured: item.isFeatured } : p))
      );
    }
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const previous = approved;
    const next = [...approved];
    const fromIndex = next.findIndex((a) => a.id === dragId);
    const toIndex = next.findIndex((a) => a.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setApproved(next);
    setDragId(null);
    const result = await reorderTestimonialsAction(next.map((a) => a.id));
    if ("error" in result) {
      setApproved(previous);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "PENDING", label: t.tabPending, count: pending.length },
    { key: "APPROVED", label: t.tabApproved, count: approved.length },
    { key: "REJECTED", label: t.tabRejected, count: rejected.length },
  ];

  return (
    <div className="flex h-full flex-col p-lg">
      <div className="mb-md flex items-center justify-between">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">{t.title}</h1>
      </div>

      <div className="mb-md flex gap-[6px]">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-full px-md py-[6px] text-[13px] font-medium ${
              tab === item.key ? "bg-primary text-on-primary" : "bg-surface text-on-surface-muted border border-border"
            }`}
          >
            {item.label}
            {item.count > 0 ? ` (${item.count})` : ""}
          </button>
        ))}
      </div>

      {tab === "PENDING" && (
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
          {pending.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-[6px] px-lg py-xl text-center">
              <p className="text-[15px] font-medium text-on-surface">{t.emptyPendingTitle}</p>
              <p className="max-w-[320px] text-[13px] text-on-surface-muted">{t.emptyPendingBody}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-[8px] p-md">
              {pending.map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-surface-subtle p-md">
                  <div className="mb-[6px] flex flex-wrap items-center gap-[8px]">
                    <span className="text-[13px] font-medium text-on-surface">{item.authorName}</span>
                    {item.isVerified && (
                      <span className="rounded-full bg-success/12 px-[8px] py-[2px] text-[11px] font-medium text-success">
                        {t.verifiedBadge}
                      </span>
                    )}
                    {item.rating !== null ? (
                      <Stars rating={item.rating} />
                    ) : (
                      <span className="text-[11px] text-on-surface-muted">{t.noRating}</span>
                    )}
                    <span className="ml-auto text-[11px] text-on-surface-muted">
                      {formatDate(item.createdAt, lang)}
                    </span>
                  </div>
                  {item.quote && <p className="mb-[10px] text-[13px] text-on-surface-muted">{item.quote}</p>}
                  <div className="flex gap-[8px]">
                    <button
                      type="button"
                      onClick={() => handleApprove(item)}
                      className="rounded-sm bg-success px-md py-[5px] text-[12px] font-medium text-on-success"
                    >
                      {t.approve}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(item)}
                      className="rounded-sm border border-border px-md py-[5px] text-[12px] font-medium text-on-surface-muted"
                    >
                      {t.reject}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "APPROVED" && (
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
          {approved.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-lg py-xl text-center text-[13px] text-on-surface-muted">
              {t.emptyApproved}
            </div>
          ) : (
            <>
              <p className="border-b border-border px-md py-[8px] text-[11px] text-on-surface-muted">
                {t.reorderHint}
              </p>
              <div className="flex flex-col">
                {approved.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(item.id)}
                    className={`flex items-center gap-md px-md py-[10px] ${
                      index !== approved.length - 1 ? "border-b border-border" : ""
                    } ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                  >
                    <span aria-hidden className="cursor-grab select-none text-on-surface-muted" title="Drag to reorder">
                      ⠿
                    </span>
                    <span className="flex-1 truncate text-[13px] text-on-surface">
                      <span className="font-medium">{item.authorName}</span>
                      {item.quote ? ` — "${item.quote}"` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleFeatured(item)}
                      aria-label={t.toggleFeatured}
                      className={`text-[18px] ${item.isFeatured ? "text-warning" : "text-on-surface-muted"}`}
                    >
                      {item.isFeatured ? "★" : "☆"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "REJECTED" && (
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
          {rejected.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-lg py-xl text-center text-[13px] text-on-surface-muted">
              {t.emptyRejected}
            </div>
          ) : (
            <div className="flex flex-col">
              {rejected.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-md px-md py-[10px] ${
                    index !== rejected.length - 1 ? "border-b border-border" : ""
                  } ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                >
                  <span className="flex-1 truncate text-[13px] text-on-surface-muted">
                    <span className="font-medium text-on-surface">{item.authorName}</span>
                    {item.quote ? ` — "${item.quote}"` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
