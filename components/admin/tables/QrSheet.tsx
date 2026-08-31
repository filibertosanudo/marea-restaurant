"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

type SheetTable = { id: string; code: string; zone: string | null; qrSvg: string };
type TableDict = AdminDictionary["tables"];

/**
 * All the interactivity here is show/hide over QR markup already rendered
 * server-side (page.tsx) — no client-side QR generation, so the qrToken
 * itself never needs a browser-side library or a round trip to render.
 */
export function QrSheet({ tables, dict }: { tables: SheetTable[]; dict: TableDict }) {
  const [mode, setMode] = useState<"all" | "one">("all");
  const [selectedId, setSelectedId] = useState(tables[0]?.id ?? "");

  const visible = mode === "all" ? tables : tables.filter((t) => t.id === selectedId);

  return (
    <div>
      <div className="proposal-toolbar mb-lg flex flex-wrap items-center justify-between gap-md print:hidden">
        <div className="flex items-center gap-md">
          <Link href="/admin/mesas" className="text-[13px] text-primary hover:underline">
            ← {dict.backToTables}
          </Link>
          <div className="inline-flex rounded-full border border-border bg-surface-subtle p-[3px]">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
                mode === "all" ? "bg-primary text-on-primary" : "text-on-surface-muted"
              }`}
            >
              {dict.printAllTables} ({tables.length})
            </button>
            <button
              type="button"
              onClick={() => setMode("one")}
              className={`rounded-full px-md py-[6px] text-[12.5px] font-medium ${
                mode === "one" ? "bg-primary text-on-primary" : "text-on-surface-muted"
              }`}
            >
              {dict.printOneTable}
            </button>
          </div>
          {mode === "one" && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-sm border border-border bg-surface px-sm py-[6px] text-[12.5px] text-on-surface"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.zone ? `${t.zone} · ${t.code}` : t.code}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button type="button" onClick={() => window.print()}>
          {dict.printButton}
        </Button>
      </div>

      <div className="qr-print-area">
        <div className="qr-paper">
          <div className={`qr-grid ${mode === "one" ? "qr-grid-single" : ""}`}>
            {visible.map((t) => (
              <div key={t.id} className="qr-card">
                <div className="qr-card-brand">
                  <span className="qr-card-dot">M</span> MAREA
                </div>
                <div className="qr-card-mark" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
                <div className="qr-card-cta">{dict.scanCta}</div>
                <div className="qr-card-name">{t.zone ? `${t.zone} · ${t.code}` : t.code}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
