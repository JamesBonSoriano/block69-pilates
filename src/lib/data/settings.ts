// Reads the PUBLIC settings (prices, cafe details, links) from the `settings` table.
// Where it's used: the Header (cafe name, Chat With Us link), the Footer
// (address, email, social links) and the Home page (class price, mat price).
//
// CACHING (Next.js "use cache"):
//   These settings rarely change, and they're the same for every visitor, so
//   the result is kept in Next.js's cache instead of asking Supabase on every
//   page view.
//   - cacheLife("minutes"): the server re-reads them from Supabase in the
//     background at most once a minute, and the copy expires after 1 hour.
//     A browser that already loaded a page may keep showing its copy for up to
//     5 minutes while clicking between pages.
//   - cacheTag("settings"): when the admin saves Settings or Pricing,
//     saveSettings() calls updateTag("settings") to clear this cache instantly.
//   It's safe for prices: the price shown here is only for display. book_seat()
//   in the database reads the price again and works out the real total.

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Json } from "@/types/database";

// Every public setting the website uses, already turned into normal values.
export type PublicSettings = {
  classPrice: number; // pesos, includes the upsized drink
  matPrice: number; // pesos, all donated to feed stray animals
  cutoffTime: string; // e.g. "08:00" (Philippine time, on class day)
  holdMinutes: number; // seat hold while paying, e.g. 15
  drinkOptions: string[]; // free drink choices for booking step 2
  manualPaymentEnabled: boolean; // show the GCash / BPI transfer backup?
  cafeName: string;
  cafeAddress: string;
  cafeEmail: string;
  cafePhone: string;
  mapsUrl: string;
  logoPath: string | null; // file in Supabase Storage, or null = no logo yet
  instagramUrl: string;
  facebookUrl: string;
  chatUrl: string; // the "Chat With Us" link (Messenger)
  gcashName: string;
  gcashNumber: string;
  bpiAccountName: string;
  bpiAccountNumber: string;
};

// Loads all public settings (cached, see the note at the top of this file).
// Takes: nothing.
// Gives back: a PublicSettings object. Throws an error if Supabase can't be
// reached or a price is missing (errors are never cached).
export async function getPublicSettings(): Promise<PublicSettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");

  const supabase = createPublicClient();

  // Guests can only read settings marked is_public (Row Level Security), but
  // we filter too, so this list means the same thing whoever runs it.
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("is_public", true);

  if (error) {
    throw new Error(`Could not load settings: ${error.message}`);
  }

  // Turn the list of rows into a lookup: { class_price: 500, cafe_name: "...", ... }
  const values = new Map<string, Json>(data.map((row) => [row.key, row.value]));

  return {
    classPrice: requiredNumber(values, "class_price"),
    matPrice: requiredNumber(values, "mat_price"),
    cutoffTime: text(values, "cutoff_time"),
    holdMinutes: requiredNumber(values, "hold_minutes"),
    drinkOptions: textList(values, "drink_options"),
    manualPaymentEnabled: values.get("manual_payment_enabled") === true,
    cafeName: text(values, "cafe_name") || "Block 69 Cafe",
    cafeAddress: text(values, "cafe_address"),
    cafeEmail: text(values, "cafe_email"),
    cafePhone: text(values, "cafe_phone"),
    mapsUrl: text(values, "maps_url"),
    logoPath: text(values, "logo_path") || null,
    instagramUrl: text(values, "instagram_url"),
    facebookUrl: text(values, "facebook_url"),
    chatUrl: text(values, "chat_url"),
    gcashName: text(values, "gcash_name"),
    gcashNumber: text(values, "gcash_number"),
    bpiAccountName: text(values, "bpi_account_name"),
    bpiAccountNumber: text(values, "bpi_account_number"),
  };
}

// Reads one setting as text.
// Takes: the settings lookup and a key.
// Gives back: the text, or "" if the setting is missing or isn't text.
function text(values: Map<string, Json>, key: string): string {
  const value = values.get(key);
  return typeof value === "string" ? value : "";
}

// Reads one setting that MUST be a number (prices, hold minutes).
// Takes: the settings lookup and a key.
// Gives back: the number. Throws if it's missing, because guessing a price
// would be wrong.
function requiredNumber(values: Map<string, Json>, key: string): number {
  const value = values.get(key);
  if (typeof value !== "number") {
    throw new Error(`The "${key}" setting is missing or is not a number.`);
  }
  return value;
}

// Reads one setting that is a list of text (e.g. drink_options).
// Takes: the settings lookup and a key.
// Gives back: the list, or [] if it's missing.
function textList(values: Map<string, Json>, key: string): string[] {
  const value = values.get(key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
