// The root layout: the outer <html> and <body> shared by EVERY page
// (client, login and admin pages).
// Where it's used: Next.js wraps every page in this automatically.
// It loads our two fonts and the global styles. The Header and Footer are NOT
// here, because admin pages get a different layout; they live in
// src/app/(client)/layout.tsx instead.

import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins } from "next/font/google";
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
export const metadata: Metadata = {
  title: {
    default: "Block 69 Cafe · Mindful Mat Pilates",
    template: "%s · Block 69 Cafe",
  },
  description:
    "Book a beginner Mindful Mat Pilates class at Block 69 Cafe in Comembo, Taguig City. Every class comes with an upsized matcha or coffee.",
};

// Phone settings: use the real screen width, and color the phone's top bar brown.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#43271B", // brown (a hex is needed here: this is not a CSS class)
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
