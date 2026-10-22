// The Supabase client for SERVER code that needs to know WHO is logged in:
// Server Components, Server Actions and API routes.
// Where it's used: pages like My Account and the admin pages, and the booking
// actions (Steps 7 and later).
//
// It reads the user's login cookies, so Supabase treats every query as that
// user, and Row Level Security applies to them.
// Pages that use it must wrap that part in <Suspense>, because cookies are
// only known when someone actually visits (see src/app/(client)/page.tsx).
// For public data that is the same for everyone, use ./public.ts instead.

import "server-only"; // stops this file from ever being bundled into browser code
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Makes a Supabase client for the current visitor.
// Takes: nothing (it reads the visitor's cookies itself).
// Gives back: a typed Supabase client acting as the logged-in user (or as a
// guest if nobody is logged in). Make a NEW one for every request, never share it.
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      // Lets Supabase read the login cookies from the visitor's request.
      getAll() {
        return cookieStore.getAll();
      },
      // Lets Supabase save refreshed login cookies.
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components are not allowed to change cookies, so this fails
          // there. That's fine: src/proxy.ts already refreshes the login
          // cookies before the page runs.
        }
      },
    },
  });
}
