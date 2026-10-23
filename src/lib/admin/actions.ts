"use server";
// Server Actions for the admin's daily work (Step 11 part 1).
// Where it's used:
//   Attendance buttons (src/components/admin/AttendanceButtons.tsx): setAttendance()
//   Walk-in form       (src/components/admin/WalkInForm.tsx):        addWalkIn()
//   Cancel class box   (src/components/admin/CancelClassButton.tsx): cancelClass()
//   Change booking box (src/components/admin/BookingChangeBox.tsx):  changeOneBooking()
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
import type { AttendanceState, BookingChangeState, CancelClassState, WalkInState } from "@/lib/admin/form-state";
import { paymentMethodName } from "@/lib/booking-rules";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import { formatClassDate, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid, isValidMobile } from "@/lib/validation";

// ---------------------------------------------------------------------------
// ATTENDANCE: mark a guest Attended or No-show
// ---------------------------------------------------------------------------

// Marks one booking as attended or no-show.
// Takes: the previous state, and the form: booking_id, and status =
// "attended" or "no_show" (the value of the button that was pressed).
// Gives back: { saved } with the new status, or { error }.
// admin_set_attendance() (migration 3) only allows confirmed / attended /
// no-show bookings, on or after the class day. Marking again fixes a mistake
// (attended <-> no-show).
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
// WALK-IN BOOKING
// ---------------------------------------------------------------------------

// The ways a walk-in can pay (admin_walkin_booking accepts exactly these).
const WALKIN_METHODS = ["cash", "gcash", "bpi"] as const;
type WalkInMethod = (typeof WALKIN_METHODS)[number];

// Adds a walk-in booking (someone booking at the counter, no account needed).
// Takes: the previous state, and the form: session_id, full_name, mobile,
// drink (one of the settings drink_options, e.g. "Iced Matcha" or "Decide
// at the cafe"; the database checks it), mat ("yes" / "no"), first_time ("on" if
// ticked), health_notes, not_pregnant and agreed ("on" = confirmed in
// person), payment ("cash", "gcash" or "bpi").
// Gives back: field errors, a general error, or { done } with the result and
// the seats left in that class.
// admin_walkin_booking() (migration 3) LOCKS the class row and checks a seat
// is free, exactly like an online booking, so walk-ins can never overbook.
// It reads the prices from settings and saves the booking as confirmed with
// a paid payment recorded by this admin.
export async function addWalkIn(_previous: WalkInState, formData: FormData): Promise<WalkInState> {
  // Squash double spaces in the name ("Ana  Cruz" -> "Ana Cruz")
  const fullName = readText(formData, "full_name").replace(/\s+/g, " ");
  const mobile = readText(formData, "mobile");
  const sessionId = readText(formData, "session_id");
  const drink = readText(formData, "drink");
  const mat = readText(formData, "mat");
  const firstTime = formData.get("first_time") === "on";
  const healthNotes = readText(formData, "health_notes");
  const notPregnant = formData.get("not_pregnant") === "on";
  const agreed = formData.get("agreed") === "on";
  const payment = readText(formData, "payment");
  // Kept so the form can be filled in again after an error
  const values = {
    session_id: sessionId,
    full_name: fullName,
    mobile,
    drink,
    mat,
    first_time: firstTime ? "on" : "",
    health_notes: healthNotes,
    not_pregnant: notPregnant ? "on" : "",
    agreed: agreed ? "on" : "",
    payment,
  };

  // Check every field first, so the admin sees all problems at once
  const fieldErrors: Record<string, string> = {};
  if (!isUuid(sessionId)) {
    fieldErrors.session_id = "Please pick a class.";
  }
  if (!fullName) {
    fieldErrors.full_name = "Please enter the guest's name.";
  } else if (fullName.length > 120) {
    fieldErrors.full_name = "Please use 120 characters or fewer.";
  }
  if (!isValidMobile(mobile)) {
    fieldErrors.mobile = "Please enter a valid mobile number, for example 0917 123 4567.";
  }
  if (mat !== "yes" && mat !== "no") {
    fieldErrors.mat = "Please choose whether they rent a mat.";
  }
  if (healthNotes.length > 1000) {
    fieldErrors.health_notes = "Please keep the notes under 1,000 characters.";
  }
  if (!notPregnant) {
    fieldErrors.not_pregnant = "Please confirm the health check with the guest.";
  }
  if (!agreed) {
    fieldErrors.agreed = "Please confirm the guest agreed to the policy and agreement.";
  }
  if (!isWalkInMethod(payment)) {
    fieldErrors.payment = "Please choose how they paid.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }
  const method = payment as WalkInMethod;

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN, values };

  // The real booking: one locked step in the database
  const { data, error } = await supabase.rpc("admin_walkin_booking", {
    p_session_id: sessionId,
    p_name: fullName,
    p_contact: mobile,
    p_payment_method: method,
    p_not_pregnant: notPregnant,
    p_agreed: agreed,
    p_mat_rental: mat === "yes",
    p_drink_choice: drink || undefined, // nothing picked = saved as empty
    p_first_time: firstTime,
    p_health_notes: healthNotes || undefined,
  });
  const result = data?.[0];
  if (error || !result) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR, values };
  }

  // For the "Booked" box: the class's date and time, and the seats left now.
  // (Admins may read classes; seats_left() uses the same rule as booking.)
  const [{ data: session }, { data: seatsLeft }] = await Promise.all([
    supabase.from("class_sessions").select("date, start_time, end_time").eq("id", sessionId).single(),
    supabase.rpc("seats_left", { p_session_id: sessionId }),
  ]);

  // Draw the page again, so the class list shows the new seat counts
  refresh();
  return {
    done: {
      bookingId: result.booking_id,
      guestName: fullName,
      sessionId,
      classLabel: session
        ? `${formatClassDate(session.date).short} · ${formatTimeRange(session.start_time, session.end_time)}`
        : "the class you picked",
      total: Number(result.total),
      paidWith: paymentMethodName(method, method === "cash" ? "cash" : "manual"),
      seatsLeft: seatsLeft ?? 0,
    },
  };
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
// CANCEL OR TRANSFER ONE BOOKING (booking details page)
// ---------------------------------------------------------------------------

// The longest reason the database accepts (migration 10).
const MAX_NOTE = 500;

// Cancels or moves ONE booking for a client.
// Takes: the previous state, and the form: booking_id, choice ("transfer",
// "voucher" = cancel with a 50% code, "no_credit" = cancel with nothing),
// new_session_id (for a transfer) and note (the reason).
// Gives back: { done } with a message (and the new booking / the 50% code),
// or { error }.
// The database decides everything (admin_transfer_booking /
// admin_cancel_booking, migration 10): the normal rule needs no reason, a
// different outcome (an override) needs one, and a transfer always needs a
// free seat in an open class (both classes are locked, so no overbooking).
// The reason is saved in booking_admin_actions, which clients can't read.
export async function changeOneBooking(_previous: BookingChangeState, formData: FormData): Promise<BookingChangeState> {
  const bookingId = readText(formData, "booking_id");
  const choice = readText(formData, "choice");
  const newSessionId = readText(formData, "new_session_id");
  const note = readText(formData, "note");

  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }
  if (choice !== "transfer" && choice !== "voucher" && choice !== "no_credit") {
    return { error: "Please choose what to do with this booking." };
  }
  if (choice === "transfer" && !isUuid(newSessionId)) {
    return { error: "Please pick the class to move them to." };
  }
  if (note.length > MAX_NOTE) {
    return { error: `Please keep the reason to ${MAX_NOTE} characters or less.` };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  if (choice === "transfer") {
    // Move: the database checks the rule, the seat and the reason, with locks
    const { data, error } = await supabase.rpc("admin_transfer_booking", {
      p_booking_id: bookingId,
      p_new_session_id: newSessionId,
      p_note: note || undefined,
    });
    const result = data?.[0];
    if (error || !result) {
      return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
    }
    // For the message: the new class's date and time (admins may read classes)
    const { data: session } = await supabase
      .from("class_sessions")
      .select("date, start_time, end_time")
      .eq("id", newSessionId)
      .single();
    const label = session
      ? `${formatClassDate(session.date).short} · ${formatTimeRange(session.start_time, session.end_time)}`
      : "the class you picked";
    return {
      done: { message: `Moved to ${label}.`, newBookingId: result.new_booking_id, overridden: result.overridden },
    };
  }

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

// ---------------------------------------------------------------------------
// Small helpers (not exported, so the browser can't call them; the shared
// ones are in src/lib/admin/action-helpers.ts)
// ---------------------------------------------------------------------------

// Checks a walk-in payment method from the form.
// Takes: the text sent. Gives back: true for "cash", "gcash" or "bpi".
function isWalkInMethod(value: string): value is WalkInMethod {
  return (WALKIN_METHODS as readonly string[]).includes(value);
}
