import "server-only";
import { getMailer } from "@/lib/notifications";
import { countOverdueGuests } from "@/lib/privacy/guest-retention";

export type AnonymizeAlertResult = { overdueBusinesses: number; totalRows: number; sent: boolean };

function reportHtml(counts: { businessName: string; orders: number; reservations: number }[]): string {
  const rows = counts
    .map((c) => `<tr><td>${c.businessName}</td><td>${c.orders}</td><td>${c.reservations}</td></tr>`)
    .join("");
  return `<p>The following businesses have guest contact info on Order/Reservation rows older than 24 months, waiting for a human decision.</p>
<table border="1" cellpadding="4"><tr><th>Business</th><th>Orders</th><th>Reservations</th></tr>${rows}</table>
<p>Run <code>npm run privacy:anonymize-guests</code> (add <code>-- --dry-run</code> to preview first) to anonymize them.</p>`;
}

function reportText(counts: { businessName: string; orders: number; reservations: number }[]): string {
  const lines = counts.map((c) => `  ${c.businessName}: ${c.orders} order(s), ${c.reservations} reservation(s)`);
  return [
    "The following businesses have guest contact info on Order/Reservation rows older than 24 months, waiting for a human decision.",
    "",
    ...lines,
    "",
    "Run `npm run privacy:anonymize-guests` (add `-- --dry-run` to preview first) to anonymize them.",
  ].join("\n");
}

/**
 * The report Q7 of module 18's scope answers with: anonymize-old-guests.ts
 * is deliberately manual (see its own header comment), so this is what
 * makes sure the decision gets noticed, without making it for anyone. Sends
 * nothing when nothing is overdue, and never anonymizes anything itself.
 */
export async function sendAnonymizeAlert(to: string, now = new Date()): Promise<AnonymizeAlertResult> {
  const counts = await countOverdueGuests(now);
  const totalRows = counts.reduce((sum, c) => sum + c.orders + c.reservations, 0);
  if (counts.length === 0) return { overdueBusinesses: 0, totalRows: 0, sent: false };

  await getMailer().send({
    to,
    subject: `Marea: ${counts.length} business(es) overdue for guest anonymization`,
    html: reportHtml(counts),
    text: reportText(counts),
  });
  return { overdueBusinesses: counts.length, totalRows, sent: true };
}
