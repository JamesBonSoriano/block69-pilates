// The root layout: the outer <html> and <body> shared by EVERY page
// (client, login and admin pages).
// Where it's used: Next.js wraps every page in this automatically.
// It loads our two fonts and the global styles. The Header and Footer are NOT
// here, because admin pages get a different layout; they live in
// src/app/(client)/layout.tsx instead.

import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins } from "next/font/google";
import { SITE_NAME } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

// Poppins: headings, the logo text, big numbers and buttons.
// Poppins isn't a "variable" font, so we must list the weights we use.
const poppins = Poppins({
  variable: "--font-poppins", // globals.css turns this into the `font-heading` class
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap", // show a fallback font until Poppins has loaded
});

// Montserrat: body text, forms, tables and labels (a variable font, so all
// weights are included automatically).
const montserrat = Montserrat({
  variable: "--font-montserrat", // globals.css turns this into the `font-sans` class
  subsets: ["latin"],
  display: "swap",
});

// The browser tab title and the description search engines show.
// `template` lets each page set its own title, e.g. "About Us · Block 69 Cafe".
// Pages set their own with pageMetadata() (src/lib/metadata.ts).
export const metadata: Metadata = {
  // The site's own address, so pages can write short links like "/about" in
  // their metadata and Next.js turns them into full ones for link previews.
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Block 69 Cafe · Mindful Mat Pilates",
    template: "%s · Block 69 Cafe",
  },
  description:
    "Book a beginner Mindful Mat Pilates class at Block 69 Cafe in Comembo, Taguig City. Every class comes with an upsized matcha or coffee.",
  // Link preview for pages that don't set their own (e.g. the login pages)
  openGraph: {
    siteName: SITE_NAME,
    locale: "en_PH",
    type: "website",
  },
};

// Phone settings: use the real screen width, and color the phone's top bar
// like our header (the client header's sage-dark).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5F735D", // sage-dark (a hex is needed here: this is not a CSS class)
};

// The outer page wrapper.
// Takes: `children`, which is the page (and any inner layouts) being shown.
// Gives back: the <html> and <body> tags with the font variables attached.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${montserrat.variable}`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
