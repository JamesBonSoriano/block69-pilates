// Keeps the visitor's login fresh on every page visit.
// Where it's used: src/proxy.ts (Next.js runs it BEFORE every page loads).
//
// Why it's needed: a Supabase login is a short-lived token saved in cookies.
// Server Components can't save cookies, so this function checks the token on
// each request and, if it's about to run out, swaps it for a new one and
// saves it into the response.
//
// Step 7 will add page protection here (e.g. send guests to /login).

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Refreshes the login cookies for one request.
// Takes: the visitor's incoming request.
// Gives back: the response to continue with, carrying any refreshed cookies.
export async function updateSession(request: NextRequest) {
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
  await supabase.auth.getClaims();

  // IMPORTANT: return `supabaseResponse` itself. Returning a different
  // response would drop the refreshed cookies and log the user out at random.
  return supabaseResponse;
}
