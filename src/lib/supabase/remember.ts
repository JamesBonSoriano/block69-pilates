// "Save login next time" (Change 17, Part C): Never or Always.
// Where it's used: the three Supabase clients (server.ts, proxy.ts and the
// browser's client.ts), and the login / sign-up / Google actions
// (src/lib/auth/actions.ts) that save the person's choice.
//
// HOW IT WORKS (no password is ever stored):
//   A Supabase login lives in cookies. @supabase/ssr gives those cookies a
//   "max age" of 400 days, so they survive closing the browser.
//   We keep ONE small extra cookie, "b69_remember", saying "never" or "always".
//   Every time Supabase saves its login cookies, our cookie code looks at it:
//     - "never":  we take the max age / expiry off the login cookies. A
//                 cookie without them is a "session cookie", which the browser
//                 deletes when it is closed. So the person is logged out.
//                 b69_remember itself is a session cookie too.
//     - "always": the login cookies are saved normally (Supabase's 400 days).
//   No b69_remember cookie at all (logins from before this change, admins)
//   counts as "always", which is how the site behaved before.
// b69_remember holds no secret (just the word), so the browser's own
// Supabase client may read it too (it isn't httpOnly).
// Note: some browsers' "continue where you left off" setting brings session
// cookies back after a restart. The login page mentions it.
//
// This file must not import anything: the unit tests (tests/unit/) load it
// directly with Node.

// The name of the preference cookie.
export const REMEMBER_COOKIE = "b69_remember";

// The two choices on the login page.
export type RememberChoice = "never" | "always";

// How long "always" keeps the preference cookie (the same as Supabase's
// login cookies: 400 days, the most browsers allow).
const ALWAYS_MAX_AGE = 400 * 24 * 60 * 60;

// Reads the saved choice.
// Takes: the cookie's value (or undefined when there's no cookie).
// Gives back: "never" only for exactly "never"; anything else is "always".
export function readRememberChoice(value: string | null | undefined): RememberChoice {
  return value === "never" ? "never" : "always";
}

// Reads the choice sent by a login form.
// Takes: the form's "remember" value.
// Gives back: "always" only for exactly "always"; anything else (missing,
// junk) is "never", the safer choice and the one the form starts on.
export function rememberChoiceFromForm(value: unknown): RememberChoice {
  return value === "always" ? "always" : "never";
}

// The cookie options Supabase passes when saving a cookie (the parts we use).
type CookieLifetime = { maxAge?: number; expires?: Date };

// Changes one login cookie's options to match the choice.
// Takes: Supabase's options for the cookie, and the choice.
// Gives back:
//   "always" -> the options unchanged
//   "never"  -> the same options WITHOUT maxAge / expires (a session
//               cookie), except when Supabase is DELETING the cookie
//               (maxAge 0 or an expiry in the past), which must stay as it is.
export function applyRememberChoice<T extends CookieLifetime>(options: T, choice: RememberChoice): T {
  if (choice === "always") return options;
  const deleting =
    (options.maxAge !== undefined && options.maxAge <= 0) ||
    (options.expires !== undefined && options.expires.getTime() <= Date.now());
  if (deleting) return options;
  // Copy everything except the lifetime
  const copy = { ...options };
  delete copy.maxAge;
  delete copy.expires;
  return copy;
}

// The options for the b69_remember cookie itself.
// Takes: the choice, and whether the site runs on https (Secure cookies).
// Gives back: cookie options. "never" = a session cookie; "always" = 400 days.
export function rememberCookieOptions(choice: RememberChoice, secure: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure,
    httpOnly: false, // the browser's Supabase client reads it (no secret in it)
    ...(choice === "always" ? { maxAge: ALWAYS_MAX_AGE } : {}),
  };
}
