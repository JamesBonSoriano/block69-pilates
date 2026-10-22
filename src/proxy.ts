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
//      - /admin/...   needs an active admin (the database's is_admin()),
//                     otherwise a client is sent to the Home page
//      - a deactivated account is sent to /auth/deactivated, which logs it
//        out and explains why
//   3. Sends people who are already logged in away from /login and /signup.
//
// This is the FIRST check. Every private page checks again on the server
// (src/lib/auth/user.ts), so a mistake here can never open a private page.

import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

// Pages that need someone logged in (each also covers its sub-pages).
// /book itself (step 1, the class list) stays open to guests; booking steps
// 2 and 3 and the booked page need a login. A guest who picks a class is sent
// to /login?next=/book/details?session=<id> and comes back to the same class.
const LOGIN_REQUIRED = ["/account", "/admin", "/book/details", "/book/pay", "/book/done"];
// Pages only active admins may open.
const ADMIN_ONLY = ["/admin"];
// Pages that make no sense once you're logged in.
const GUESTS_ONLY = ["/login", "/signup"];

// Runs for each matching request.
// Takes: the incoming request.
// Gives back: the response to continue with (with refreshed login cookies),
// or a redirect to another page.
export async function proxy(request: NextRequest) {
  const { response, supabase, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (startsWithAny(pathname, LOGIN_REQUIRED)) {
    // Guest: go and log in, then come back here
    if (!userId) {
      const next = encodeURIComponent(pathname + search);
      return redirectWithCookies(request, response, `/login?next=${next}`);
    }

    // Logged in: is the account still active?
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

    // Admin pages: ask the database's is_admin() (active admins only)
    if (startsWithAny(pathname, ADMIN_ONLY)) {
      const { data: isAdmin } = await supabase.rpc("is_admin");
      if (isAdmin !== true) {
        return redirectWithCookies(request, response, "/");
      }
    }
  }

  // Already logged in but opening Log in / Sign up: carry on to "next"
  // (if it's a safe path on our site) or to My Account
  if (userId && startsWithAny(pathname, GUESTS_ONLY)) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectWithCookies(request, response, next ?? "/account");
  }

  return response;
}

// Checks if a path is one of the given pages or a page under it.
// Takes: the path (e.g. "/account/payments") and a list like ["/account"].
// Gives back: true for "/account" and "/account/payments", but false for
// "/accounting" (it must be the whole word).
function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Which requests the proxy runs for: everything EXCEPT Next.js's own files
// and images, which never need a login check (this keeps the site fast).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
