import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/env";
import { businessOrigin } from "@/lib/business-origin";
import { findPublicBusiness } from "@/lib/business";

// Without this, Next tries to statically prerender this route at `npm run
// build` time — the portable Docker build stage has no real env vars yet
// (see app/layout.tsx's own comment on the same problem), so appOrigin()'s
// underlying env validation throws and fails the build.
export const dynamic = "force-dynamic";

/**
 * Only real, public, shareable pages — never a capacity-token route
 * (/o/<publicToken>, /r/<confirmationCode>, /t/<qrToken>, /review/<publicToken>).
 * Those aren't secret, but listing them here would publish every guest's
 * order/reservation/table link in one crawlable file; they get `noindex` on
 * the page itself instead (see each route's own `metadata` export), not a
 * sitemap entry.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const business = await findPublicBusiness();
  const origin = business ? businessOrigin(business) : appOrigin();
  const now = new Date();

  return [
    { url: origin, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/menu`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
