// Checks if Google sign-in is switched on in Supabase (Version 1.5, C1).
// Where it's used: signInWithGoogle() in src/lib/auth/actions.ts, before it
// sends anyone to Google.
//
// Why it's needed: supabase.auth.signInWithOAuth() never asks the server, it
// only builds a link. When the Google provider is OFF, that link opens a raw
// Supabase error page ({"msg":"Unsupported provider: provider is not
// enabled"}). Asking first lets /login show a plain message instead.
//
// Supabase's public "settings" address says which providers are on. It only
// needs the publishable key (safe to use; it's the same one browsers get).

import "server-only"; // only our server code uses this
import { getSupabaseEnv } from "@/lib/supabase/env";

// Asks Supabase if the Google provider is on.
// Takes: nothing.
// Gives back: true (on), false (off), or null if Supabase couldn't be asked
// (then the caller just tries, as before, so a slow network never blocks
// a working Google sign-in).
export async function googleSignInIsOn(): Promise<boolean | null> {
  const { url, publishableKey } = getSupabaseEnv();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store", // always the live answer (you may switch it on any time)
      signal: AbortSignal.timeout(5_000), // never wait more than 5 seconds
    });
    if (!response.ok) return null;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    return null;
  }
}
