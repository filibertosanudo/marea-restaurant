import type { Metadata } from "next";
import { Montserrat_Alternates, Poppins } from "next/font/google";
import { headers } from "next/headers";
import { CSP_NONCE_HEADER } from "@/lib/security/csp";
import { findPublicBusiness } from "@/lib/business";
import { resolveSiteMetadataText } from "@/lib/seo/site-metadata";
import "./globals.css";

const montserratAlternates = Montserrat_Alternates({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-montserrat-alternates",
  preload: false,
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-poppins",
  preload: false,
});

/**
 * The site-wide fallback — any page without its own `generateMetadata`
 * (every admin/order/reservation/review route) inherits this. The public
 * homepage's own title/description ultimately come from the same source
 * (BusinessTranslation, resolved for the business's own default language),
 * not a hardcoded string — see this function.
 */
export async function generateMetadata(): Promise<Metadata> {
  return resolveSiteMetadataText();
}

// Root-level, so it covers every route: without an explicit dynamic API
// (cookies/headers), Next tries to statically prerender any page at build
// time, including ones that read the database with no caching — a menu
// change in the admin panel would never reach a page baked in at build
// time, and `next build` would need a live database reachable from inside
// an isolated Docker build stage, which a portable build can't assume.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
  // The root layout cannot 404 (Next refuses notFound() here), and a host that
  // names no business is not an error for it: the admin login, for one, needs
  // no business. The pages that do need one 404 for themselves.
  const business = await findPublicBusiness();

  return (
    // suppressHydrationWarning: the inline script below sets data-theme
    // before React hydrates (harmless, expected mismatch there); the guest
    // order flow and the landing also correct `lang` client-side once the
    // visitor's own language choice is known (a cookie or localStorage
    // value this server render has no access to) — this is only ever the
    // business's own default, the best a first paint can do.
    <html lang={business?.defaultLocale ?? "es"} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          // Set data-theme before paint so there's no flash of the wrong
          // theme while React hydrates.
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('marea-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}",
          }}
        />
      </head>
      <body
        className={`${montserratAlternates.variable} ${poppins.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
