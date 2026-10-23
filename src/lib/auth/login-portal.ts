// The rules for our TWO separate logins, and for which pages each kind of
// account may open (Revisions part 1, item 1):
//   - /login        is for CLIENTS only. An admin account is refused there.
//   - /admin/login  is for ADMINS (cafe staff) only. A client account is refused.
//   - logged-in admins can't use the client-only pages (/book, /account):
//     they are sent to /admin instead. Public pages (Home, About, Policies)
//     still open for everyone.
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

// Shown on /login when an ADMIN account tries to log in there.
export const USE_ADMIN_LOGIN_MESSAGE =
  "This is a staff account, so it can't log in here. Please use the admin login page.";

// Shown on /admin/login when a CLIENT account tries to log in there.
export const USE_CLIENT_LOGIN_MESSAGE =
  "This login is only for cafe staff. To book classes, please use the client login page.";

// Pages only clients use. A logged-in admin opening one goes to /admin.
// (/book covers the class list, the booking steps and the booked page.)
export const CLIENT_ONLY_PATHS = ["/book", "/account"];

// Checks if an account used the wrong login page.
// Takes: which login page was used, and whether the account is an active admin.
// Gives back: true if the login must be refused (an admin on the client page,
// or a client on the admin page).
export function isWrongPortal(portal: LoginPortal, isAdmin: boolean): boolean {
  return portal === "client" ? isAdmin : !isAdmin;
}

// The message to show when isWrongPortal() is true.
// Takes: which login page was used.
// Gives back: the message that points them to the other login page.
export function wrongPortalMessage(portal: LoginPortal): string {
  return portal === "client" ? USE_ADMIN_LOGIN_MESSAGE : USE_CLIENT_LOGIN_MESSAGE;
}

// Checks if a path is one of the given pages or a page under it.
// Takes: the path (e.g. "/account/payments") and a list like ["/account"].
// Gives back: true for "/account" and "/account/payments", but false for
// "/accounting" (it must be the whole word).
export function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Checks if a path is one of the PROTECTED admin pages.
// Takes: a path, e.g. "/admin/bookings".
// Gives back: true for /admin and every page under it, EXCEPT the admin login
// page itself (guests must be able to open that).
export function isAdminPagePath(pathname: string): boolean {
  return isUnder(pathname, ["/admin"]) && !isUnder(pathname, [ADMIN_LOGIN_PATH]);
}

// Checks if a path is a client-only page (see CLIENT_ONLY_PATHS).
// Takes: a path. Gives back: true for /book..., /account...
export function isClientOnlyPath(pathname: string): boolean {
  return isUnder(pathname, CLIENT_ONLY_PATHS);
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
