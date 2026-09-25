import "server-only";
import { appOrigin, env } from "@/lib/env";
import { originFor } from "@/lib/business-host";

/** The origin this business's own URLs (emails, QR codes, sitemap) are built on. */
export function businessOrigin(business: { slug: string }): string {
  return originFor(business.slug, appOrigin(), env.BUSINESS_ROOT_DOMAIN);
}
