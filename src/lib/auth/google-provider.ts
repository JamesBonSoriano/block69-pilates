// Checks if Google sign-in is switched on in Supabase (Version 1.5, C1).
// Where it's used: signInWithGoogle() in src/lib/auth/actions.ts, before it
// sends anyone to Google, and signUp() there (signupConfirmationStatus:
// is Supabase's "Confirm email" on, so sign-up really sends a code?).
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
  const settings = await readAuthSettings();
  return settings ? settings.external?.google === true : null;
}

// Checks that Supabase will require a code before creating a signup session
// (Supabase dashboard: Authentication > Sign In / Providers > Email >
// "Confirm email"). Supabase reports it as mailer_autoconfirm: false = ON.
// Takes: nothing.
// Gives back (Version 1.9, so the caller can log the real reason):
//   "on"       Confirm email is ON: sign-up sends a 6-digit code
//   "off"      Confirm email is OFF: Supabase would log new people in with
//              NO code, so sign-up must stop
//   "unknown"  Supabase's settings couldn't be read (network, wrong URL or key)
export async function signupConfirmationStatus(): Promise<"on" | "off" | "unknown"> {
  const settings = await readAuthSettings();
  if (!settings || typeof settings.mailer_autoconfirm !== "boolean") return "unknown";
  return settings.mailer_autoconfirm ? "off" : "on";
}

// Reads public Auth settings once per request, without logging credentials.
async function readAuthSettings(): Promise<{ external?: Record<string, boolean>; mailer_autoconfirm?: boolean } | null> {
  const { url, publishableKey } = getSupabaseEnv();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store", // always the live answer (you may switch it on any time)
      signal: AbortSignal.timeout(5_000), // never wait more than 5 seconds
    });
    if (!response.ok) {
      // Version 1.9: say why (the status only; no keys are ever logged)
      console.error(`Supabase Auth settings answered ${response.status} (check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).`);
      return null;
    }
    return await response.json();
  } catch (problem) {
    console.error("Supabase Auth settings could not be read:", problem instanceof Error ? problem.message : problem);
    return null;
  }
}
