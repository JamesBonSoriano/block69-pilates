// The rules for our TWO separate logins, and for which pages each kind of
// account may open (Revisions part 1, item 1):
//   - /login        is for CLIENTS only. An admin account is refused there.
//   - /admin/login  is for ADMINS (cafe staff) only. A client account is refused.
//   - logged-in admins can't use the client pages (Home, About Us, Policies,
//     /book, /account): they are sent to /admin instead (Version 1.6).
// Where it's used: src/lib/auth/actions.ts (the two login actions),
// src/proxy.ts (the first page check) and src/lib/auth/user.ts (the second
// check inside each page). tests/unit/login-portal.test.mjs tests it.
//
// These are plain functions with no Next.js or Supabase imports, so the unit
// test can run them directly. They only DECIDE; whether someone really is an
// admin always comes from the database's is_admin() (migration 2).

// Which login page someone used.
export type LoginPortal = "client" | "admin";

// The two login pages.
export const CLIENT_LOGIN_PATH = "/login";
export const ADMIN_LOGIN_PATH = "/admin/login";

// The ONE message for every refused login, on both login pages: a wrong
// password, an email with no account, an admin on /login, a client on
// /admin/login, and an admin's Google account on the client side.
// Because they all look the same, nobody can use the login pages to find
// out which emails have an account, or which accounts are staff. It never
// mentions staff, admins or the other login page.
export const INCORRECT_LOGIN_MESSAGE = "Incorrect email or password.";

// Supabase error codes from a password login that must show
// INCORRECT_LOGIN_MESSAGE (and nothing more specific):
//   - invalid_credentials: wrong password OR no account with that email
//     (Supabase already gives the same code for both)
//   - user_not_found, user_banned: in case Supabase ever names these
//     separately, they must not give away that the email exists
export const HIDDEN_LOGIN_ERROR_CODES = ["invalid_credentials", "user_not_found", "user_banned"];

// Pages only clients use. A logged-in admin opening one goes to /admin.
// (/book covers the class list, the booking steps and the booked page.)
// Version 1.6 (admin item 1): the public client pages (About Us, Policies
// and Home, "/", checked in isClientOnlyPath()) count too, so an admin who is
// logged in never wanders around the client side. Login, sign-up, password
// reset, /auth/* and /api/* are NOT here, so they keep working.
export const CLIENT_ONLY_PATHS = ["/book", "/account", "/about", "/policies"];

// Checks if an account used the wrong login page.
// Takes: which login page was used, and whether the account is an active admin.
// Gives back: true if the login must be refused (an admin on the client page,
// or a client on the admin page).
export function isWrongPortal(portal: LoginPortal, isAdmin: boolean): boolean {
  return portal === "client" ? isAdmin : !isAdmin;
}

// Checks if a Supabase login error must be shown as the plain
// "Incorrect email or password." (see HIDDEN_LOGIN_ERROR_CODES).
// Takes: the error's code (may be missing).
// Gives back: true if the real reason must stay hidden.
export function isHiddenLoginError(code: string | undefined): boolean {
  return code !== undefined && HIDDEN_LOGIN_ERROR_CODES.includes(code);
}

// Checks if a path is one of the given pages or a page under it.
// Takes: the path (e.g. "/account/payments") and a list like ["/account"].
// Gives back: true for "/account" and "/account/payments", but false for
// "/accounting" (it must be the whole word).
export function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Checks if a path is one of the PROTECTED admin pages.
// Takes: a path, e.g. "/admin/appointments".
// Gives back: true for /admin and every page under it, EXCEPT the admin login
// page itself (guests must be able to open that).
export function isAdminPagePath(pathname: string): boolean {
  return isUnder(pathname, ["/admin"]) && !isUnder(pathname, [ADMIN_LOGIN_PATH]);
}

// Checks if a path is a client-only page (see CLIENT_ONLY_PATHS).
// Takes: a path.
// Gives back: true for Home ("/" exactly), /book..., /account..., /about...
// and /policies...; false for everything else (login pages, /auth, /api,
// /admin...).
export function isClientOnlyPath(pathname: string): boolean {
  // "/" must match exactly: as a prefix it would match every page
  return pathname === "/" || isUnder(pathname, CLIENT_ONLY_PATHS);
}

// ---------------------------------------------------------------------------
// Google: "Continue with Google" on /login must not make new accounts
// (Version 1.6, PDF item 1)
// ---------------------------------------------------------------------------

// Which Google button was pressed: the one on /login, or the one on /signup.
// It travels through Google and back in the /auth/confirm address (?mode=).
export type GoogleMode = "login" | "signup";

// Reads the mode from a form or the address.
// Takes: the raw value (may be missing or anything).
// Gives back: "signup" only when it says exactly that; anything else counts
// as "login", the safer choice (it never makes a new account).
export function readGoogleMode(value: unknown): GoogleMode {
  return value === "signup" ? "signup" : "login";
}

// How recent an account must be to count as "made by THIS Google sign-in".
// Supabase makes the account a moment before it sends the person back.
export const NEW_GOOGLE_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

// What we know about the account that just logged in with Google.
export type GoogleAccountFacts = {
  createdAt: string | undefined; // when Supabase made the auth account
  providers: string[]; // its login methods, e.g. ["email", "google"]
  hasMobile: boolean; // profile already has a mobile number
  hasBirthday: boolean; // profile already has a birthday
};

// Checks if a Google login just made a BRAND-NEW account (nobody had an
// account for this Google address before).
// Takes: the account facts, and "now" in milliseconds.
// Gives back: true only when ALL of these are true:
//   - it has no password login ("email"). A Google account whose email
//     already had a password account counts as existing: Supabase links
//     Google to that same account instead of making a new one.
//   - its profile has no mobile and no birthday yet (anyone who finished
//     their profile or signed up with the form is a real, existing client)
//   - the account was made within the last 2 minutes (by this very login)
export function isBrandNewGoogleAccount(facts: GoogleAccountFacts, nowMs: number): boolean {
  if (facts.providers.includes("email")) return false;
  if (facts.hasMobile || facts.hasBirthday) return false;
  const created = facts.createdAt ? Date.parse(facts.createdAt) : Number.NaN;
  if (Number.isNaN(created)) return false; // unknown: never delete anything
  return nowMs - created <= NEW_GOOGLE_ACCOUNT_WINDOW_MS;
}

// Works out where someone goes after logging in (or when they open a login
// page while they're already logged in).
// Takes: whether they're an active admin, and "next" = the page they were
// trying to open (already checked by safeNextPath(), or null).
// Gives back: a path on our site:
//   - admins:  "next" if it's an admin page, otherwise the Dashboard (/admin)
//   - clients: "next" if it's NOT an admin page, otherwise the Home page
// So nobody is ever sent somewhere their account would just bounce off.
export function landingPath(isAdmin: boolean, next: string | null): string {
  // Look only at the path part of "next" (drop ?query and #section)
  const nextPath = next ? next.split(/[?#]/)[0] : null;

  if (isAdmin) {
    return next && nextPath && isAdminPagePath(nextPath) ? next : "/admin";
  }
  return next && nextPath && !isUnder(nextPath, ["/admin"]) ? next : "/";
}

// Which login page a guest should be sent to for a private page.
// Takes: the path they tried to open.
// Gives back: /admin/login for admin pages, /login for everything else.
export function loginPathFor(pathname: string): string {
  return isAdminPagePath(pathname) ? ADMIN_LOGIN_PATH : CLIENT_LOGIN_PATH;
}
