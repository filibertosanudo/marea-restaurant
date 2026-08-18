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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
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
