import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/env";

// Without this, Next tries to statically prerender this route at `npm run
// build` time — the portable Docker build stage has no real env vars yet
// (see app/layout.tsx's own comment on the same problem), so appOrigin()'s
// underlying env validation throws and fails the build.
export const dynamic = "force-dynamic";

/**
 * /admin is disallowed outright — it's behind a login anyway, nothing there
 * is ever meant to be found by a crawler. The capacity-token routes
 * (/o, /r, /t, /review) are deliberately NOT disallowed here: Google's own
 * guidance is that a robots.txt disallow stops crawling before a crawler
 * ever reads the page's `noindex` meta tag, and a disallowed-but-linked URL
 * can still show up in search results as a bare link with no snippet — the
 * actual fix is `noindex` on each of those routes' own metadata, letting a
 * crawler that reaches one (e.g. from a shared link) find that tag and drop
 * it, not blocking the crawl and hoping the URL never surfaces at all.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = appOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
