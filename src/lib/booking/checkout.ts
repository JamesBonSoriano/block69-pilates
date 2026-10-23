// A small server-only helper for the pay page's actions: closing the
// PayMongo checkout that is still open for a booking.
// Where it's used: submitManualTransfer() in src/lib/booking/payment-actions.ts
// (before a GCash / BPI transfer) and releaseHold() in
// src/lib/booking/actions.ts (before "Change details" gives the seat up).
// It lives in its own file (not a "use server" file), so the browser can
// never call it directly.

import "server-only";
import { expireCheckoutSession, PaymongoError } from "@/lib/paymongo";
import type { createClient } from "@/lib/supabase/server";

// Closes the PayMongo checkout that is open for one of the caller's
// bookings, if there is one, so it can't be paid after the client moved on.
// Takes: the logged-in Supabase client and the booking id.
// Gives back:
//   "none"         nothing was open (or the booking can't be paid any more)
//   "closed"       it was open and is closed now
//   "paid"         it was already paid: send them to the return page
//   "in_progress"  a payment is going through on it right now
//   "error"        PayMongo couldn't be reached
export async function closeOpenCheckout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
): Promise<"none" | "closed" | "paid" | "in_progress" | "error"> {
  // start_online_payment() (migration 11) only answers for the caller's own
  // unpaid booking with a running hold, and gives back the open checkout.
  // If it refuses (hold ended, already paid...), there's nothing to close.
  const { data } = await supabase.rpc("start_online_payment", { p_booking_id: bookingId });
  const ref = data?.[0]?.paymongo_ref;
  if (!ref) return "none";
  try {
    return await expireCheckoutSession(ref);
  } catch (problem) {
    console.error("PayMongo (close checkout):", problem instanceof PaymongoError ? problem.message : problem);
    return "error";
  }
}
