// Reads the upcoming classes with their LIVE seats left.
// Where it's used: the Home page ("Next open sessions"). Booking step 1
// (Step 9) will use it too.
//
// NO CACHING, on purpose:
//   Seats left must always be the real number right now, so two people never
//   see an old count. This function never uses "use cache". It calls
//   connection() first, which tells Next.js: "only run this when someone
//   actually visits, never at build time, and never reuse the answer".
//   Because of that, pages must show it inside <Suspense> (a loading spot
//   that fills in when the data arrives).
//   Even so, the number on screen is only a preview. book_seat() in the
//   database re-checks the seat while holding a lock, so the last seat can
//   never go to two people.

import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { OpenSession } from "@/types/app";

// Loads the next classes that can be shown on the Home page (always live).
// Takes: the most classes to give back (e.g. 6).
// Gives back: classes from today onward, earliest first, that are either still
// bookable ("open") or "full". Classes the admin closed or cancelled, and
// today's classes past the booking cutoff, are left out.
// Throws if Supabase can't be reached.
export async function getUpcomingSessions(limit: number): Promise<OpenSession[]> {
  // Wait for a real visitor: makes sure this is never prerendered or cached.
  await connection();

  const supabase = createPublicClient();

  // get_open_sessions() is our database function (migration 3). With no
  // dates, it lists classes from today to 4 weeks ahead, and works out
  // seats_left, is_bookable and state for each one. Guests may call it.
  const { data, error } = await supabase.rpc("get_open_sessions");

  if (error) {
    throw new Error(`Could not load classes: ${error.message}`);
  }

  return data
    .filter((session) => session.state === "open" || session.state === "full")
    .slice(0, limit);
}
