// /auth/deactivated: logs out an account that has been deactivated, then
// shows the login page with a clear message.
// Where it's used: src/proxy.ts and requireUser() (src/lib/auth/user.ts)
// send deactivated users here. (Pages can't remove cookies themselves, but
// a route like this one can.)
//
// Safety: it ONLY logs someone out if their account really is deactivated.
// So a trick link to this address can't log out a normal user.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Runs when the browser is sent to /auth/deactivated.
// Takes: nothing (it reads the login cookies).
// Gives back: nothing; it redirects to /login?error=deactivated, or
// ?error=deactivated-self for a client who turned their own account off
// (Version 1.4: "log in again to reactivate"), or to the Home page if the
// account is actually fine.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  // Which message the login page shows
  let message = "deactivated";

  if (userId) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_active, self_deactivated_at")
      .eq("id", userId)
      .maybeSingle();

    // Account is active (or we couldn't check): don't log anyone out
    if (error || profile?.is_active) {
      redirect("/");
    }
    if (profile?.self_deactivated_at) message = "deactivated-self";

    // Deactivated: log out everywhere (all their devices)
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });

    // If Supabase couldn't be reached, remove the login cookies ourselves,
    // so the person is never stuck going round in circles
    if (signOutError) {
      const cookieStore = await cookies();
      cookieStore
        .getAll()
        .filter((cookie) => cookie.name.startsWith("sb-")) // Supabase's cookies
        .forEach((cookie) => cookieStore.delete(cookie.name));
    }
  }

  redirect(`/login?error=${message}`);
}
