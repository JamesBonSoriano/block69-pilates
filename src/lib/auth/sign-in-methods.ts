// How a person can log in: with a password, with Google, or both (Change 17).
// Where it's used: My Profile (src/app/(client)/account/profile/page.tsx) and
// the account actions (Change password, Delete account) in
// src/lib/account/actions.ts.

import type { User } from "@supabase/supabase-js";

// Checks if the account has a password (an "email" login).
// Takes: the Supabase user (from auth.getUser()).
// Gives back: true for email + password accounts (also when Google was added
// later), false for accounts that only ever used "Continue with Google".
// Those can set a first password with Forgot password.
export function hasPasswordLogin(user: Pick<User, "identities" | "app_metadata">): boolean {
  if (user.identities?.some((identity) => identity.provider === "email")) return true;
  const providers = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes("email");
}

// Checks if the account can log in with Google.
// Takes: the Supabase user. Gives back: true if Google is one of its logins.
export function hasGoogleLogin(user: Pick<User, "identities" | "app_metadata">): boolean {
  if (user.identities?.some((identity) => identity.provider === "google")) return true;
  const providers = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes("google");
}
