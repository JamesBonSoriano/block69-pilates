// Builds the "metadata" of a page: the browser tab title, the description
// Google shows under the link, and the link preview (title + text) that
// Messenger, Facebook and Viber show when someone shares the page.
// Where it's used: `export const metadata = pageMetadata(...)` in each page.
//
// Why a helper: Next.js REPLACES the whole link preview ("openGraph") of the
// layout when a page sets its own, instead of mixing them. So every page needs
// the full set, and this keeps them the same everywhere.
// (No preview picture yet: one can be added when we have real photos.)

import type { Metadata } from "next";

// The site's name in link previews and after every page title.
// (Typed here because page titles are built before any data loads. The root
// layout's title template uses the same words.)
export const SITE_NAME = "Block 69 Cafe";

type PageMetadataInput = {
  title: string; // e.g. "About Us" (the tab shows "About Us · Block 69 Cafe")
  description: string; // one or two sentences, about 150 characters at most
  path: string; // this page's address, e.g. "/about"
};

// Makes the metadata for one page.
// Takes: the page title, description and path.
// Gives back: a Next.js Metadata object for `export const metadata`.
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    // The one "official" address of this page, so Google doesn't count
    // /about and /about?x=1 as two pages. Made into a full address with
    // metadataBase from the root layout.
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_PH",
      type: "website",
    },
  };
}
