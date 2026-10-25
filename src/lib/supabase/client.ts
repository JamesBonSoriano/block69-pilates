// The Supabase client for BROWSER code (components that start with "use client").
// Where it's used: interactive parts of pages that talk to Supabase from the
// browser, e.g. the screenshot upload (manual transfer) and the admin photo
// uploads.
//
// It acts as the logged-in user (their login is kept in cookies), so Row Level
// Security only lets it see and change that user's own rows.
// Never put the secret key in here: everything in browser code is public.
// Logins are always remembered (Version 1.4 removed "Save login next time"),
// so Supabase's own cookie handling is used as it is.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Makes a Supabase client for the browser.
// Takes: nothing.
// Gives back: a typed Supabase client. (@supabase/ssr reuses one client per
// browser tab, so calling this many times is fine.)
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
