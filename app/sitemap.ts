import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/env";

/**
 * Only real, public, shareable pages — never a capacity-token route
 * (/o/<publicToken>, /r/<confirmationCode>, /t/<qrToken>, /review/<publicToken>).
 * Those aren't secret, but listing them here would publish every guest's
 * order/reservation/table link in one crawlable file; they get `noindex` on
 * the page itself instead (see each route's own `metadata` export), not a
 * sitemap entry.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  const now = new Date();

  return [
    { url: origin, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/menu`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
