"use client";

import type { PrintDocument } from "@/lib/printing/document";
import "./kitchen-ticket-print.css";

/**
 * Renders the exact same PrintDocument the agent turns into ESC/POS bytes
 * (see lib/printing/kitchen-ticket.ts) as HTML instead — one document
 * model, two renderers, so the browser backup never drifts from what the
 * printer would have produced. This is the fallback module 13 exists to
 * guarantee: it works the day a restaurant hasn't installed the agent yet,
 * and the day the agent falls over.
 */
export function KitchenTicketPrintView({
  document,
  printLabel,
}: {
  document: PrintDocument;
  printLabel: string;
}) {
  return (
    <div>
      <div className="mb-lg flex items-center justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-primary px-md py-[9px] text-[13px] font-semibold text-on-primary hover:bg-primary-hover"
        >
          {printLabel}
        </button>
      </div>

      <div className="ticket-print-area">
        <div className="ticket-paper">
          {document.lines.map((line, index) => {
            if (line.type === "rule") return <hr key={index} className="ticket-rule" />;
            if (line.type === "note") {
              return (
                <span key={index} className="ticket-note">
                  {line.text}
                </span>
              );
            }
            const classes = ["ticket-line"];
            if (line.bold) classes.push("bold");
            if (line.size === "large") classes.push("large");
            if (line.align === "center") classes.push("center");
            return (
              <div key={index} className={classes.join(" ")}>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
