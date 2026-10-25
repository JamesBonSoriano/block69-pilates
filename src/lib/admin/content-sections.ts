// The parts of the admin Content pages (Version 1.4, PDF page 24): the five
// hub cards, the friendly block names, the hidden blocks and the photo spots.
// Where it's used: src/app/admin/(panel)/content/page.tsx (the hub) and
// src/app/admin/(panel)/content/[section]/page.tsx (one section's blocks).

import type { SiteContentRow } from "@/types/app";

// The five sections: the site_content "page" value, its name, what's in it,
// and which website page shows it (for "Open the page").
export const CONTENT_SECTIONS = [
  { key: "home", label: "Home page", about: "Hero, class details, what's included, how it works, health and safety.", where: "/" },
  { key: "about", label: "About Us", about: "The cafe, the class, the instructor, FAQ, visit us and contact.", where: "/about" },
  { key: "booking", label: "Booking & policy", about: "What to bring, the cancellation policy and the Registration Agreement.", where: "/book" },
  { key: "policies", label: "Policies page", about: "The introduction on the Policies page.", where: "/policies" },
  { key: "footer", label: "Footer", about: "The stray animals note at the bottom of every page.", where: "/" },
] as const;
export type ContentSectionKey = (typeof CONTENT_SECTIONS)[number]["key"];

// Friendly names for the blocks (page/section). Blocks not listed here use
// their section name ("health_note" -> "Health note").
export const BLOCK_NAMES: Record<string, string> = {
  "home/hero": "Top of the page (hero)",
  "home/hero_kicker": "Small line above the hero title",
  "home/class_details": "Class Details & Location (the address and Maps link come from Settings)",
  "home/mat_note": "Mat rental card (in Class Details & Location; links to booking with Rent a mat ticked)",
  "home/included": "What's included",
  "home/how_it_works": "How it works (heading)",
  "home/cta": "Book now box (bottom)",
  "home/health_safety": "Health and Safety Information (bottom of Home)",
  "about/cafe": "The cafe",
  "about/instructor": "The instructor (small heading and bio)",
  "about/instructor_name": "The instructor's name (title) and description",
  "about/class": "The class",
  "about/schedule": "Schedule note",
  "about/visit": "Visit us",
  "about/contact": "Contact",
  "about/health_safety": "Health and safety",
  "about/policy_summary": "Short policy",
  "booking/what_to_bring": "What to bring (booking step 3)",
  "booking/cancellation_policy": "Cancellation policy (booking step 3 and My Bookings)",
  "booking/agreement": "Registration Agreement (booking step 3)",
  "policies/intro": "Introduction",
  "footer/strays_note": "Stray animals note",
};

// Blocks the website no longer shows (Change 17). They stay in the database,
// as agreed, but are left off the Content pages so nobody edits text nobody
// sees. Home: "About the class" + its 3 cards and the old location block
// became "Class Details & Location"; the small health note became "Health
// and Safety Information". About Us: Health and Safety moved to Home, and
// the Class Schedule section was removed.
export const HIDDEN_BLOCKS = new Set([
  "home/about_class",
  "home/feature_1",
  "home/feature_2",
  "home/feature_3",
  "home/location_drink",
  "home/health_note",
  "about/health_safety",
  "about/schedule",
]);

// The photo spots (page/section) and what to call them.
export const PHOTO_SPOTS: Record<string, string> = {
  "home/hero": "Home: top photo",
  "home/class_details": "Home: Class Details & Location photo",
  "about/cafe": "About Us: cafe photo",
  "about/instructor": "About Us: instructor photo",
};

// Finds a section by its key from the address.
// Takes: the key, e.g. "about". Gives back: the section, or undefined.
export function findContentSection(key: string) {
  return CONTENT_SECTIONS.find((section) => section.key === key);
}

// Tells if a block is shown on the Content pages (not hidden).
// Takes: the block. Gives back: true if the admin may edit it.
export function isEditableBlock(row: SiteContentRow): boolean {
  return !HIDDEN_BLOCKS.has(`${row.page}/${row.section}`);
}

// Tells if a block still has a [PLACEHOLDER] in its title or text.
// Takes: the block. Gives back: true if it does.
export function hasPlaceholder(row: SiteContentRow): boolean {
  return /\[[^\]]+\]/.test(`${row.title ?? ""}\n${row.body ?? ""}`);
}

// Turns a section name into words, e.g. "faq_3" -> "FAQ 3", "health_note" -> "Health note".
// Takes: the section name. Gives back: the words.
export function sectionName(section: string): string {
  const words = section.replace(/_/g, " ").replace(/^faq\b/, "FAQ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Sorts blocks so numbered ones come in number order (faq_2 before faq_10),
// and the rest alphabetically.
// Takes: two blocks. Gives back: a number for Array.sort.
export function byNumberedSection(a: SiteContentRow, b: SiteContentRow): number {
  const parse = (section: string) => {
    const match = /^(.*?)_(\d+)$/.exec(section);
    return match ? { base: match[1], n: Number(match[2]) } : { base: section, n: 0 };
  };
  const x = parse(a.section);
  const y = parse(b.section);
  return x.base === y.base ? x.n - y.n : x.base.localeCompare(y.base);
}
