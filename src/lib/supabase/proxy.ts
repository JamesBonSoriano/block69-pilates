// Keeps the visitor's login fresh on every page visit, and tells src/proxy.ts
// who is logged in so it can protect private pages.
// Where it's used: src/proxy.ts (Next.js runs it BEFORE every page loads).
//
// Why it's needed: a Supabase login is a short-lived token saved in cookies.
// Server Components can't save cookies, so this function checks the token on
// each request and, if it's about to run out, swaps it for a new one and
// saves it into the response.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// What updateSession() gives back to src/proxy.ts.
export type ProxySession = {
  // The response to continue with (it carries any refreshed login cookies)
  response: NextResponse;
  // A Supabase client acting as this visitor (for the role checks)
  supabase: ReturnType<typeof createServerClient<Database>>;
  // The logged-in user's id, or null for a guest
  userId: string | null;
};

// Refreshes the login cookies for one request and finds out who is logged in.
// Takes: the visitor's incoming request.
// Gives back: a ProxySession (see above).
export async function updateSession(request: NextRequest): Promise<ProxySession> {
  const { url, publishableKey } = getSupabaseEnv();

  // By default: "carry on to the page, with no changes".
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      // Read the login cookies from the request.
      getAll() {
        return request.cookies.getAll();
      },
      // Supabase calls this when it has refreshed the login.
      // `headers` are "don't cache this" headers, so a shared cache can never
      // hand one person's login to someone else.
      setAll(cookiesToSet, headers) {
        // 1. Put the new cookies on the request, so the page sees them now.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // 2. Make a fresh response from that updated request...
        supabaseResponse = NextResponse.next({ request });
        // 3. ...and put the new cookies on it, so the browser saves them.
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        // 4. Add the "don't cache" headers.
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // IMPORTANT: don't put other code between createServerClient and this line.
  // getClaims() checks the login token's signature (so a fake cookie is
  // rejected) and refreshes it if needed, which calls setAll above.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  // IMPORTANT: src/proxy.ts must return this `response` (or use
  // redirectWithCookies below). Returning a brand-new response would drop the
  // refreshed cookies and log the user out at random.
  return { response: supabaseResponse, supabase, userId };
}

// Sends the visitor to another page WITHOUT losing refreshed login cookies.
// Takes: the request, the response from updateSession(), and where to go
// (a path on our site, e.g. "/login?next=%2Faccount").
// Gives back: a redirect response carrying the same cookies and headers.
export function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  path: string,
): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.url));

  // Copy any refreshed login cookies
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  // Copy the "don't cache" headers Supabase added (if any)
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(name);
    if (value) redirect.headers.set(name, value);
  }

  return redirect;
}
