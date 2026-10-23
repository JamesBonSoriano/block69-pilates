// The Supabase client for BROWSER code (components that start with "use client").
// Where it's used: interactive parts of pages that talk to Supabase from the
// browser, e.g. the screenshot upload (manual transfer) and the admin photo
// uploads.
//
// It acts as the logged-in user (their login is kept in cookies), so Row Level
// Security only lets it see and change that user's own rows.
// Never put the secret key in here: everything in browser code is public.
//
// "Save login next time" (Change 17): this client can refresh the login and
// save new login cookies from the browser too, so it reads and writes the
// cookies itself (instead of Supabase's built-in way) to apply the same rule
// as the server: "never" = session cookies (see ./remember.ts).

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";
import { REMEMBER_COOKIE, applyRememberChoice, readRememberChoice } from "./remember";

// Makes a Supabase client for the browser.
// Takes: nothing.
// Gives back: a typed Supabase client. (@supabase/ssr reuses one client per
// browser tab, so calling this many times is fine.)
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey, {
    cookies: {
      // Reads every cookie this page can see.
      getAll() {
        return readBrowserCookies();
      },
      // Saves login cookies, as session cookies if they chose "Never".
      setAll(cookiesToSet) {
        const remember = readRememberChoice(
          readBrowserCookies().find((cookie) => cookie.name === REMEMBER_COOKIE)?.value,
        );
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookie(name, value, applyRememberChoice(options, remember));
        });
      },
    },
  });
}

// Reads the page's cookies.
// Takes: nothing.
// Gives back: a list of { name, value } (values decoded).
function readBrowserCookies(): { name: string; value: string }[] {
  if (!document.cookie) return [];
  return document.cookie.split("; ").map((pair) => {
    const split = pair.indexOf("=");
    const name = split === -1 ? pair : pair.slice(0, split);
    const raw = split === -1 ? "" : pair.slice(split + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Not encoded by us: keep it as it is
    }
    return { name, value };
  });
}

// Writes one cookie as the text document.cookie expects
// (the same format Supabase's own cookie code writes).
// Takes: the name, the value and Supabase's cookie options.
// Gives back: e.g. "sb-xyz-auth-token=...; Path=/; Max-Age=34560000; SameSite=Lax".
function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.sameSite) {
    // true means "Strict"; otherwise "lax" -> "Lax" etc.
    const sameSite = options.sameSite === true ? "strict" : String(options.sameSite);
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
