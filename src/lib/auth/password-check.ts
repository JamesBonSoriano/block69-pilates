// Checks a person's CURRENT password without touching their login cookies.
// Where it's used: Change password and Delete account on My Profile
// (src/lib/account/actions.ts), Change 17.
//
// Why: before changing the password or deleting the account, we ask for the
// current password again, so someone using an unlocked phone can't do it.
// This makes a SEPARATE, throwaway Supabase client (no cookies, nothing
// saved), tries to log in with the email and password, and if that works it
// logs that throwaway login straight out again. The person's own login on
// this device is not changed.
// (Supabase's "Require current password when updating" setting checks the
// password on change too; this works even when that setting is off.)

import "server-only"; // never sent to the browser
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

// What the check found.
//   "ok"     the password is right
//   "wrong"  the password is wrong
//   "error"  Supabase couldn't be asked (e.g. too many tries); try again later
export type PasswordCheck = "ok" | "wrong" | "error";

// Checks an email + password pair.
// Takes: the account's login email and the password typed.
// Gives back: "ok", "wrong" or "error" (see above). Never logs the password.
export async function checkCurrentPassword(email: string, password: string): Promise<PasswordCheck> {
  if (!email || !password) return "wrong";
  const { url, publishableKey } = getSupabaseEnv();
  // A client that keeps nothing: no cookies, no storage, no refreshing
  const throwaway = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error } = await throwaway.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return "wrong";
    console.error("Password check failed:", error.code ?? error.status);
    return "error";
  }
  // End only this throwaway login ("local" = this one, not their others)
  await throwaway.auth.signOut({ scope: "local" });
  return "ok";
}
