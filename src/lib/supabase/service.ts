// The Supabase client that uses the SECRET key (the "service role").
// Where it's used: ONLY the PayMongo webhook (src/app/api/paymongo/webhook/
// route.ts) and the PayMongo return route (src/app/(client)/book/pay/
// [bookingId]/return/route.ts). Never in a page, a component or browser code.
//
// Why it's needed: confirm_online_payment() (migration 11) marks a booking
// as paid, so the database lets ONLY the secret key call it. Nobody can mark
// their own booking as paid from the browser.
//
// DANGER: this key skips every Row Level Security rule. "server-only" makes
// the build fail if any browser code ever imports this file, and the key
// (SUPABASE_SECRET_KEY) has no NEXT_PUBLIC_ in its name, so Next.js never
// puts it in browser code either.

import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Makes a Supabase client with the secret key.
// Takes: nothing (reads SUPABASE_SECRET_KEY from .env.local / Vercel).
// Gives back: a typed client that acts as our server (no user, no cookies).
// Throws a clear error if the key hasn't been added yet (the error never
// contains the key itself).
export function createServiceClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is missing. Add it to .env.local (Supabase > Project Settings > API Keys > Secret key), then restart `npm run dev`.",
    );
  }
  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false, // a server key never "logs in"
      autoRefreshToken: false,
    },
  });
}
