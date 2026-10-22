// Turns the image_path saved in site_content into a web address for
// next/image.
// Where it's used: the SiteImage component (photo spots on Home and About Us).
//
// image_path can be written two ways:
//   1. "/images/hero.jpg"  -> a file in the project's public/images/ folder
//      (starts with "/"). Good for now, before the admin can upload photos.
//   2. "home/hero.jpg"     -> a file in the Supabase Storage bucket
//      "site-images" (no "/" at the start). The admin's Content Management page
//      (Step 11) will upload photos there and save this kind of path.
// Anything else (empty, or a full https:// address to another website) gives
// back null, and the page shows the brown gradient box instead. next/image
// only loads photos from places allowed in next.config.ts, so a random web
// address would crash the page; that's why we refuse it here.

import { getSupabaseEnv } from "@/lib/supabase/env";

// The Supabase Storage bucket that holds page photos (made in Step 11).
export const SITE_IMAGES_BUCKET = "site-images";

// Works out the web address of one page photo.
// Takes: the image_path from site_content (may be null).
// Gives back: e.g. "/images/hero.jpg" or
// "https://<project>.supabase.co/storage/v1/object/public/site-images/home/hero.jpg",
// or null if there's no usable photo.
export function siteImageUrl(path: string | null | undefined): string | null {
  const value = path?.trim();
  if (!value) return null;

  // Never allow "..", which could point outside the folder we expect
  if (value.split(/[\\/]/).includes("..")) return null;

  // 1. A file in public/: one "/" at the start (two would mean another website)
  if (value.startsWith("/")) {
    return value.startsWith("//") || value.includes("\\") ? null : value;
  }

  // A full web address (https://...) is not allowed (see the note at the top)
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  // 2. A file in the Supabase Storage bucket. Each part of the path is
  // made web-safe (e.g. a space becomes %20).
  const { url } = getSupabaseEnv();
  const safePath = value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${SITE_IMAGES_BUCKET}/${safePath}`;
}
