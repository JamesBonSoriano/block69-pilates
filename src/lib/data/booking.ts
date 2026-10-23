// Reads what the booking pages show: the class list with LIVE seats left,
// one class, and the logged-in client's own bookings.
// Where it's used: /book (step 1), /book/details (step 2, including the
// choices kept after "Change details"), /book/pay/[id] (step 3) and
// /book/done/[id] (You're booked), plus the booking action.
//
// NO CACHING, on purpose: seats left, holds and booking statuses must always
// be the real values right now. Nothing here says "use cache".
//   - The class functions call connection() first, which tells Next.js:
//     "only run this when someone actually visits, never at build time, and
//     never reuse the answer". So two people never see an old seat count.
//   - The "my booking" functions use the LOGGED-IN Supabase client, so they
//     call `await io()` before createClient() (the Step 7 rule, see the notes
//     in src/lib/supabase/server.ts). Pages must show them inside <Suspense>.
// Even so, what the page shows is only a preview: book_seat() in the database
// checks everything again, with a lock, when the person clicks Confirm.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { voucherLabel } from "@/lib/booking-rules";
import type { VoucherPreview } from "@/lib/booking/form-state";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { BookingStatus, MyBooking, OpenSession } from "@/types/app";

// Loads the classes in a date range, in every state, for booking step 1 and
// the transfer page (full, closed and cancelled classes are shown greyed out).
// Takes: optionally { from, to } ("YYYY-MM-DD", e.g. one month for the month
// navigator, Change 17). Without it: today to 4 weeks ahead.
// Gives back: the classes, earliest first. Throws if Supabase can't be reached.
export async function getBookingSessions(range?: { from: string; to: string }): Promise<OpenSession[]> {
  // Wait for a real visitor: never prerendered or cached.
  await connection();

  const supabase = createPublicClient();
  // get_open_sessions() (migration 3) works out seats_left, is_bookable and
  // state for each class. It never goes back before today (so the past days
  // of this month are left out) and never more than 92 days at once.
  const { data, error } = await supabase.rpc(
    "get_open_sessions",
    range ? { p_from_date: range.from, p_to_date: range.to } : {},
  );
  if (error) {
    throw new Error(`Could not load classes: ${error.message}`);
  }
  return data;
}

// Loads ONE class with its live seats left (for a page).
// Takes: the class id from the address (?session=...).
// Gives back: the class, or null if the id is wrong, the class doesn't exist,
// or its date has already passed. Throws if Supabase can't be reached.
export async function getSessionForBooking(sessionId: string): Promise<OpenSession | null> {
  await connection();
  return loadSession(sessionId);
}

// Same as getSessionForBooking, without connection(). Used by the booking
// action (Server Actions always run for a real visitor, so they don't need it).
// Takes: the class id.
// Gives back: the class or null (see above).
export async function loadSession(sessionId: string): Promise<OpenSession | null> {
  if (!isUuid(sessionId)) return null;
  const supabase = createPublicClient();

  // 1. Find the class's date (everyone may read class_sessions).
  const { data: row, error: rowError } = await supabase
    .from("class_sessions")
    .select("date")
    .eq("id", sessionId)
    .maybeSingle();
  if (rowError) {
    throw new Error(`Could not load the class: ${rowError.message}`);
  }
  if (!row) return null;

  // 2. Ask get_open_sessions() for just that one day, so seats left, the
  //    cutoff and the state are worked out by the database, exactly as on
  //    step 1. (It skips days before today, so a past class gives null.)
  const { data, error } = await supabase.rpc("get_open_sessions", {
    p_from_date: row.date,
    p_to_date: row.date,
  });
  if (error) {
    throw new Error(`Could not load the class: ${error.message}`);
  }
  return data.find((session) => session.session_id === sessionId) ?? null;
}

// Loads one of the logged-in client's OWN bookings (pay page, booked page).
// Takes: the booking id from the address.
// Gives back: the booking, or null if the id is wrong, it doesn't exist, or
// it belongs to someone else (get_my_booking() in migration 6 only ever gives
// back the caller's own booking). Throws if Supabase can't be reached.
export async function getMyBooking(bookingId: string): Promise<MyBooking | null> {
  if (!isUuid(bookingId)) return null;

  // Step 7 rule: io() BEFORE createClient() while drawing a page.
  await io();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_my_booking", { p_booking_id: bookingId });
  if (error) {
    throw new Error(`Could not load your booking: ${error.message}`);
  }
  // The generated type says some columns are never empty; MyBooking says
  // which ones can be (see src/types/app.ts).
  return (data[0] as MyBooking | undefined) ?? null;
}

// Checks a voucher code again for the logged-in client (for a page).
// Used by step 2 after "Change details": the old booking's code is only
// filled back in if it still works (someone may have used the last use, or
// it may have expired, since the hold was made).
// Takes: the code.
// Gives back: { ok: true, code, label, discount } or { ok: false, error }
// (the same shape as the Apply button's answer). Never throws for a bad code.
export async function checkMyVoucher(code: string): Promise<VoucherPreview> {
  await io();
  const supabase = await createClient();
  // check_voucher() (migration 3) reserves nothing and never reveals other
  // people's codes.
  const { data, error } = await supabase.rpc("check_voucher", { p_code: code });
  const voucher = data?.[0];
  if (error || !voucher) {
    // Our own database messages are plain English (code P0001)
    return { ok: false, error: error?.code === "P0001" ? error.message : "Sorry, that voucher code isn't valid." };
  }
  return {
    ok: true,
    code: voucher.code,
    label: voucherLabel(voucher.percent_off ?? null, voucher.amount_off ?? null),
    discount: Number(voucher.discount),
  };
}

// The logged-in client's booking that holds a seat in one class, if any.
export type MySessionBooking = { bookingId: string; status: BookingStatus };

// Checks if the logged-in client already holds a seat in one class (for a page).
// Takes: the class id.
// Gives back: { bookingId, status } (status is pending_payment with a live
// hold, confirmed, awaiting_verification or attended), or null if none.
export async function getMySessionBooking(sessionId: string): Promise<MySessionBooking | null> {
  await io();
  return findMySessionBooking(await createClient(), sessionId);
}

// Same check, with a Supabase client the caller already made (used by the
// booking action, which doesn't need io()).
// Takes: a logged-in Supabase client and the class id.
// Gives back: { bookingId, status } or null.
export async function findMySessionBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<MySessionBooking | null> {
  if (!isUuid(sessionId)) return null;
  // get_my_session_booking() (migration 6) counts a seat exactly like
  // book_seat() does, and only looks at the caller's own bookings.
  const { data, error } = await supabase.rpc("get_my_session_booking", { p_session_id: sessionId });
  if (error) {
    throw new Error(`Could not check your bookings: ${error.message}`);
  }
  const row = data[0];
  return row ? { bookingId: row.booking_id, status: row.status } : null;
}
