// Helpers that turn editable page text (the site_content table) into what the
// page shows.
// Where it's used: Home, About Us and Policies (and later the booking pages).
//
// Three jobs:
//   1. fillSettings(): swaps "fill-in" words like {mat_price} for the current
//      value from settings, so prices are never typed into page text.
//   2. splitLines(): page text uses one line per list item (or paragraph).
//   3. numberedSections(): finds repeating blocks like faq_1, faq_2, ...
//
// LINK fill-in words (Change 17): {facebook_link} and {instagram_link} (used
// by the Registration Agreement). Normally they become the plain words
// "facebook" / "instagram". A page that wants real links calls
// fillSettings(text, settings, { keepLinks: true }) and hands socialLinks()
// to <ContentText> / <Paragraphs> (src/components/content/ContentText.tsx),
// which turn them into links to the Facebook / Instagram pages in Settings.

import type { ContentBlock } from "@/lib/data/content";
import type { PublicSettings } from "@/lib/data/settings";
import { formatPeso, formatTime } from "@/lib/format";

// The fill-in words page text may use, and how to get each value.
// Keep this list the same as KNOWN_FILL_INS in
// supabase/tests/08-page-content.test.mjs (that test fails if page text uses
// a word that isn't here).
const FILL_INS: Record<string, (settings: PublicSettings) => string> = {
  class_price: (s) => formatPeso(s.classPrice), // e.g. "₱500"
  mat_price: (s) => formatPeso(s.matPrice), // e.g. "₱50"
  cutoff_time: (s) => formatTime(s.cutoffTime), // e.g. "8:00 AM"
  hold_minutes: (s) => String(s.holdMinutes), // e.g. "15"
  cafe_name: (s) => s.cafeName, // e.g. "Block 69 Cafe"
  facebook_link: () => "facebook", // a link where the page allows it (see above)
  instagram_link: () => "instagram",
};

// One social link for a LINK fill-in word.
export type SocialLink = { label: string; href: string };

// The link fill-in words and where they point.
// Takes: the public settings.
// Gives back: { facebook_link: { label: "facebook", href: <facebook_url> }, ... }.
// An empty href (not set in Settings) shows as the plain word.
export function socialLinks(settings: PublicSettings): Record<string, SocialLink> {
  return {
    facebook_link: { label: "facebook", href: settings.facebookUrl },
    instagram_link: { label: "instagram", href: settings.instagramUrl },
  };
}

// The names of the link fill-in words, e.g. "facebook_link".
const LINK_FILL_INS = new Set(["facebook_link", "instagram_link"]);

// Lists every fill-in word with what it becomes right now.
// Where it's used: the admin Content page (the "Fill-in words" list and the
// live preview under each text box).
// Takes: the public settings.
// Gives back: e.g. { class_price: "₱500", cutoff_time: "8:00 AM", ... }.
export function fillInValues(settings: PublicSettings): Record<string, string> {
  return Object.fromEntries(Object.entries(FILL_INS).map(([name, getValue]) => [name, getValue(settings)]));
}

// Swaps every {fill_in} word in a text for its current settings value.
// Takes: the text (may be null/undefined), the public settings, and
// optionally { keepLinks: true } to leave {facebook_link} / {instagram_link}
// in place for <ContentText links=...> to turn into links.
// Gives back: the finished text ("" if there was no text). A word in curly
// brackets that isn't in FILL_INS is left exactly as it is.
export function fillSettings(
  text: string | null | undefined,
  settings: PublicSettings,
  options: { keepLinks?: boolean } = {},
): string {
  if (!text) return "";
  return text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => {
    if (options.keepLinks && LINK_FILL_INS.has(name)) return whole;
    const getValue = FILL_INS[name];
    return getValue ? getValue(settings) : whole;
  });
}

// Splits list text into its items (one item per line).
// Takes: the text, e.g. "Mat\nSmall towel\n\nWater bottle".
// Gives back: ["Mat", "Small towel", "Water bottle"]. Blank lines and extra
// spaces are dropped. Works for Windows line endings (\r\n) too.
export function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Finds the numbered blocks of one kind on a page, in number order.
// Takes: a page's content (from getPageContent) and the name before the
// number, e.g. "faq" for faq_1, faq_2, ... or "step" for step_1, step_2, ...
// Gives back: the blocks sorted by their number (faq_2 before faq_10).
// Blocks with no title are skipped, so the admin can "hide" one by clearing it.
export function numberedSections(
  content: Record<string, ContentBlock | undefined>,
  prefix: string,
): ContentBlock[] {
  const pattern = new RegExp(`^${prefix}_(\\d+)$`);
  return Object.entries(content)
    .map(([section, block]) => ({ number: Number(pattern.exec(section)?.[1]), block }))
    .filter(
      (item): item is { number: number; block: ContentBlock } =>
        Number.isFinite(item.number) && Boolean(item.block?.title?.trim()),
    )
    .sort((a, b) => a.number - b.number)
    .map((item) => item.block);
}
