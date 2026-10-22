// A Supabase client for PUBLIC data that is the same for every visitor:
// page text, public settings (prices, contact details) and the class list.
// Where it's used: the read functions in src/lib/data/.
//
// It does NOT read cookies, so it always acts as a guest ("anon" role). Row
// Level Security only lets guests read public things, so it can never leak a
// user's private rows. Not reading cookies is also what allows Next.js to
// cache its results (see src/lib/data/settings.ts).

import "server-only"; // only our server code uses this one
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Makes a guest Supabase client.
// Takes: nothing.
// Gives back: a typed Supabase client that never logs in or saves a session.
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false, // nobody logs in with this client
      autoRefreshToken: false,
    },
  });
}
