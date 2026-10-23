// Reads the editable page text (site_content table) for one page.
// Where it's used: Home, About Us, Policies and the Footer (stray animals
// note). The booking pages will use it too (Step 9).
// Pages turn the text into what's shown with src/lib/content-text.ts
// (fill-in words like {mat_price}, one item per line).
//
// CACHING (Next.js "use cache"):
//   Page text almost never changes and is the same for everyone, so it's cached.
//   - cacheLife("hours"): the server re-reads it from Supabase in the
//     background at most once an hour, and the copy expires after 1 day.
//     A browser may keep its copy for up to 5 minutes while clicking around.
//   - cacheTag("site-content"): when the admin saves the Content Management
//     page, saveContent() / saveSiteImage() call updateTag("site-content") so the new
//     text shows straight away.

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { SiteContentRow } from "@/types/app";

// The parts of one content block that pages show.
export type ContentBlock = Pick<SiteContentRow, "title" | "body" | "image_path">;

// Loads every content block for one page (cached, see the note above).
// Takes: the page name, e.g. "home", "about", "booking" or "footer".
// Gives back: a lookup by section name, e.g. content.hero?.title.
// A section the admin hasn't made comes back as undefined, so pages must
// handle that. Throws if Supabase can't be reached (errors are never cached).
export async function getPageContent(
  page: string,
): Promise<Record<string, ContentBlock | undefined>> {
  "use cache";
  cacheLife("hours");
  cacheTag("site-content");

  const supabase = createPublicClient();

  // Everyone may read site_content (it's public page text).
  const { data, error } = await supabase
    .from("site_content")
    .select("section, title, body, image_path")
    .eq("page", page);

  if (error) {
    throw new Error(`Could not load the "${page}" page text: ${error.message}`);
  }

  // Turn the rows into { hero: {...}, health_note: {...}, ... }
  return Object.fromEntries(
    data.map(({ section, ...block }) => [section, block]),
  );
}
