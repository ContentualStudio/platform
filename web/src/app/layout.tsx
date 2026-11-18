import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/app/providers";
import { THEME_PRE_PAINT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const metropolis = localFont({
  display: "swap",
  variable: "--font-metropolis",
  src: [
    { path: "../fonts/metropolis/Metropolis-Thin.otf", weight: "100", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-ThinItalic.otf", weight: "100", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-ExtraLight.otf", weight: "200", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-ExtraLightItalic.otf", weight: "200", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-Light.otf", weight: "300", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-LightItalic.otf", weight: "300", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-RegularItalic.otf", weight: "400", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-Medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-SemiBold.otf", weight: "600", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-SemiBoldItalic.otf", weight: "600", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-Bold.otf", weight: "700", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-BoldItalic.otf", weight: "700", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-ExtraBold.otf", weight: "800", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-ExtraBoldItalic.otf", weight: "800", style: "italic" },
    { path: "../fonts/metropolis/Metropolis-Black.otf", weight: "900", style: "normal" },
    { path: "../fonts/metropolis/Metropolis-BlackItalic.otf", weight: "900", style: "italic" }
  ]
});

const ivyPresto = localFont({
  display: "swap",
  variable: "--font-ivypresto",
  src: "../fonts/ivypresto/ivy-presto-display.otf"
});

export const metadata: Metadata = {
  title: "Contentual.studio",
  description: "Contentual web app",
  icons: {
    icon: [{ url: "/brand/contentual-favicon.png", type: "image/png" }],
    apple: [{ url: "/brand/contentual-favicon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_PRE_PAINT_SCRIPT }}
        />
      </head>
      <body
        className={`${metropolis.variable} ${ivyPresto.variable}`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
