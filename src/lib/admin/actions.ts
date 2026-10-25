"use server";
// Server Actions for the admin's daily work (Step 11 part 1).
// Where it's used:
//   Attendance buttons (src/components/admin/AttendanceButtons.tsx): setAttendance()
//   Cancel class box   (src/components/admin/CancelClassButton.tsx): cancelClass()
//   Cancel booking box (src/components/admin/BookingChangeBox.tsx):  changeOneBooking()
// (Version 1.4 removed the Walk-in booking page and the admin transfer;
// their database functions stay.)
//
// "use server" = these run ONLY on our server; the browser just sends the
// form here. Each one:
//   1. checks the form values (friendly first checks),
//   2. checks AGAIN that the caller is an active admin (is_admin() in the
//      database), so a client who sends the form by hand gets nothing,
//   3. calls the database function from migration 3, which checks the
//      admin and every rule once more (seats, class day, ...) with a lock.
// The website never writes to the tables directly.

import { refresh } from "next/cache";
import { NOT_ADMIN, isAdmin, readText } from "@/lib/admin/action-helpers";
import type { AttendanceState, BookingChangeState, CancelClassState } from "@/lib/admin/form-state";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

// ---------------------------------------------------------------------------
// ATTENDANCE: mark a guest Attended or No-show
// ---------------------------------------------------------------------------

// Marks one booking as attended or no-show.
// Takes: the previous state, and the form: booking_id, and status =
// "attended" or "no_show" (the value of the button that was pressed).
// Gives back: { saved } with the new status, or { error }.
// admin_set_attendance() (migrations 3 and 18) only allows PAID confirmed /
// attended / no-show bookings, on or after the class day, never in a class
// the cafe cancelled. Marking again fixes a mistake (attended <-> no-show).
export async function setAttendance(_previous: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const bookingId = readText(formData, "booking_id");
  const status = readText(formData, "status");
  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }
  if (status !== "attended" && status !== "no_show") {
    return { error: "Please choose Attended or No-show." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_set_attendance", {
    p_booking_id: bookingId,
    p_status: status,
  });
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }

  // Draw the page again so the counts and badges update
  refresh();
  return { saved: status };
}

// ---------------------------------------------------------------------------
// CANCEL A CLASS
// ---------------------------------------------------------------------------

// Cancels one class (for example the instructor is sick).
// Takes: the previous state, and the form: session_id.
// Gives back: { done } with how many bookings were holding a seat, or { error }.
// admin_cancel_session() (migration 3) marks the class 'cancelled' and leaves
// its bookings as they are, so the booked clients can move to another class
// for free from My Bookings. The page refreshes when the box is closed (so the
// admin can read the result first).
export async function cancelClass(_previous: CancelClassState, formData: FormData): Promise<CancelClassState> {
  const sessionId = readText(formData, "session_id");
  if (!isUuid(sessionId)) {
    return { error: "Sorry, we couldn't find that class." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { data, error } = await supabase.rpc("admin_cancel_session", { p_session_id: sessionId });
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  return { done: { bookedCount: data ?? 0 } };
}

// ---------------------------------------------------------------------------
// CANCEL ONE BOOKING (booking details page)
// ---------------------------------------------------------------------------

// The longest reason the database accepts (migration 10).
const MAX_NOTE = 500;

// Cancels ONE booking for a client.
// Takes: the previous state, and the form: booking_id, choice ("voucher" =
// cancel with a 50% code, "no_credit" = cancel with nothing) and note (the
// reason).
// Gives back: { done } with a message (and the 50% code), or { error }.
// Version 1.4: the admin no longer moves clients to a chosen class. Clients
// transfer themselves from My Bookings, so "transfer" is refused here.
// The database decides everything (admin_cancel_booking, migration 10): the
// normal rule needs no reason, a different outcome (an override) needs one.
// The reason is saved in booking_admin_actions, which clients can't read.
export async function changeOneBooking(_previous: BookingChangeState, formData: FormData): Promise<BookingChangeState> {
  const bookingId = readText(formData, "booking_id");
  const choice = readText(formData, "choice");
  const note = readText(formData, "note");

  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }
  if (choice !== "voucher" && choice !== "no_credit") {
    return { error: "Please choose how to cancel this booking." };
  }
  if (note.length > MAX_NOTE) {
    return { error: `Please keep the reason to ${MAX_NOTE} characters or less.` };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // Cancel: with a 50% code ("voucher") or with nothing ("no_credit")
  const { data, error } = await supabase.rpc("admin_cancel_booking", {
    p_booking_id: bookingId,
    p_outcome: choice,
    p_note: note || undefined,
  });
  const result = data?.[0];
  if (error || !result) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
  }
  return {
    done: {
      message:
        choice === "voucher"
          ? "Cancelled. The client got a personal 50% code for the class fee (60 days, one use). It shows in their My Vouchers."
          : "Cancelled with no credit (forfeited).",
      voucherCode: result.voucher_code ?? undefined,
      overridden: result.overridden,
    },
  };
}
