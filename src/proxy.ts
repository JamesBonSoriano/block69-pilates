// The Next.js "proxy": code that runs BEFORE every page request.
// (Next.js 16 renamed this file from middleware.ts to proxy.ts. It must sit in
// src/, next to the app/ folder.)
// Where it's used: Next.js finds and runs it automatically.
//
// What it does:
//   1. Keeps the visitor's Supabase login fresh (src/lib/supabase/proxy.ts).
//   2. Protects private pages:
//      - /account/... and booking steps 2-3 (/book/details, /book/pay,
//        /book/done) need a logged-in user, otherwise -> /login?next=...
//      - /admin/...   needs an active admin (the database's is_admin()).
//                     A guest goes to the ADMIN login (/admin/login?next=...),
//                     a client is sent to the Home page.
//                     /admin/login itself is open to guests.
//      - a deactivated account is sent to /auth/deactivated, which logs it
//        out and explains why
//   3. Keeps admins out of the client-only pages: a logged-in admin opening
//      /book... or /account... goes to /admin (Revisions part 1, item 1).
//      Public pages (Home, About Us, Policies) still open for admins.
//   4. Sends people who are already logged in away from the login pages
//      (/login, /signup, /admin/login) to where their account belongs.
//
// This is the FIRST check. Every private page checks again on the server
// (src/lib/auth/user.ts), so a mistake here can never open a private page.

import type { NextRequest } from "next/server";
import {
  ADMIN_LOGIN_PATH,
  isAdminPagePath,
  isClientOnlyPath,
  isUnder,
  landingPath,
  loginPathFor,
} from "@/lib/auth/login-portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

// Client pages that need someone logged in (each also covers its sub-pages).
// /book itself (step 1, the class list) stays open to guests; booking steps
// 2 and 3 and the booked page need a login. A guest who picks a class is sent
// to /login?next=/book/details?session=<id> and comes back to the same class.
// (The admin pages are checked separately with isAdminPagePath().)
const LOGIN_REQUIRED = ["/account", "/book/details", "/book/pay", "/book/done"];
// Pages that make no sense once you're logged in.
const GUESTS_ONLY = ["/login", "/signup", ADMIN_LOGIN_PATH];

// Runs for each matching request.
// Takes: the incoming request.
// Gives back: the response to continue with (with refreshed login cookies),
// or a redirect to another page.
export async function proxy(request: NextRequest) {
  const { response, supabase, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // What kind of page is this?
  const adminPage = isAdminPagePath(pathname);
  const needsLogin = adminPage || isUnder(pathname, LOGIN_REQUIRED);
  const clientOnly = isClientOnlyPath(pathname);
  const guestsOnly = isUnder(pathname, GUESTS_ONLY);

  // Guest: private pages send them to the right login page, then back here
  if (!userId) {
    if (needsLogin) {
      const next = encodeURIComponent(pathname + search);
      return redirectWithCookies(request, response, `${loginPathFor(pathname)}?next=${next}`);
    }
    return response;
  }

  // Logged in, on a page with no rules for logged-in people (Home, About...):
  // nothing more to check, so no extra database calls
  if (!needsLogin && !clientOnly && !guestsOnly) {
    return response;
  }

  // Private page: is the account still active?
  if (needsLogin) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    // (If the database couldn't be reached we DON'T log them out; the page's
    // own check will show an error instead.)
    if (!error && !profile?.is_active) {
      return redirectWithCookies(request, response, "/auth/deactivated");
    }
  }

  // Ask the database's is_admin() (active admins only), so the rule lives in
  // one place (migration 2)
  const { data: isAdminAnswer } = await supabase.rpc("is_admin");
  const isAdmin = isAdminAnswer === true;

  // Admin pages: clients go to the Home page
  if (adminPage && !isAdmin) {
    return redirectWithCookies(request, response, "/");
  }

  // Client-only pages (booking, My Account): admins go to their Dashboard
  if (clientOnly && isAdmin) {
    return redirectWithCookies(request, response, "/admin");
  }

  // Already logged in but opening a login page: carry on to "next" (if it's a
  // safe path that fits their account) or to their usual start page
  if (guestsOnly) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectWithCookies(request, response, landingPath(isAdmin, next));
  }

  return response;
}

// Which requests the proxy runs for: everything EXCEPT Next.js's own files,
// images, and the PayMongo webhook (PayMongo has no login, and the webhook
// checks PayMongo's signature itself). This keeps the site fast.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/paymongo/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
