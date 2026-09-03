import type { Metadata } from "next";
import { Montserrat_Alternates, Poppins } from "next/font/google";
import "./globals.css";

const montserratAlternates = Montserrat_Alternates({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-montserrat-alternates",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Marea — Seafood Restaurant",
  description:
    "Marea: mariscos frescos, servidos con el oceano como inspiracion.",
};

// Root-level, so it covers every route: without an explicit dynamic API
// (cookies/headers), Next tries to statically prerender any page at build
// time, including ones that read the database with no caching — a menu
// change in the admin panel would never reach a page baked in at build
// time, and `next build` would need a live database reachable from inside
// an isolated Docker build stage, which a portable build can't assume.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme
    // before React hydrates, which otherwise reports a (harmless, expected)
    // hydration mismatch on this element every load.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
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
