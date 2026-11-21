"use server";
// Server Actions for the admin's daily work (Step 11 part 1).
// Where it's used:
//   Attendance buttons (src/components/admin/AttendanceButtons.tsx): setAttendance()
//   Cancel class box   (src/components/admin/CancelClassButton.tsx): cancelClass()
//   Cancel appointment box (src/components/admin/CancelAppointmentBox.tsx): cancelAppointment()
//   Re-schedule box    (src/components/admin/RescheduleBox.tsx):     rescheduleBooking()
//   Reject payment box (src/components/admin/RejectPaymentButton.tsx): rejectPayment()
// (Version 1.4 removed the Walk-in booking page and the admin transfer;
// their database functions stay. Version 1.6 added the admin re-schedule,
// with its own database function, and a reason when rejecting a payment.)
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
import {
  NOT_ADMIN,
  isAdmin,
  readText,
  type ServerClient,
} from "@/lib/admin/action-helpers";
import type {
  AdminSaveState,
  AttendanceState,
  CancelAppointmentState,
  CancelClassState,
  RescheduleState,
} from "@/lib/admin/form-state";
import { cafeDetails, sendLogged } from "@/lib/admin/logged-email";
import { bookingReference } from "@/lib/booking-rules";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import {
  cafeCancelEmail,
  rescheduleEmail,
  wholeClassCancelledEmail,
  type CafeCancelDetails,
} from "@/lib/email-text";
import {
  formatClassDate,
  formatManilaDate,
  formatTime,
  formatTimeRange,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { AdminBookingDetails } from "@/types/app";

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
export async function setAttendance(
  _previous: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
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
export async function cancelClass(
  _previous: CancelClassState,
  formData: FormData,
): Promise<CancelClassState> {
  const sessionId = readText(formData, "session_id");
  if (!isUuid(sessionId)) {
    return { error: "Sorry, we couldn't find that class." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { data, error } = await supabase.rpc("admin_cancel_class_for_email", {
    p_session_id: sessionId,
  });
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  // The cancellation returns only the clients affected by this successful transition.
  const result = data as {
    bookedCount: number; classDate: string; startTime: string; endTime: string;
    recipients: { user_id: string; booking_id: string; kind: Parameters<typeof wholeClassCancelledEmail>[1] }[];
  };
  const cafe = await cafeDetails();
  const classLabel = `${formatClassDate(result.classDate).full} · ${formatTimeRange(result.startTime, result.endTime)}`;
  const deliveries = await Promise.allSettled(result.recipients.map((recipient) =>
    cafe ? sendLogged(supabase, {
      userId: recipient.user_id, bookingId: recipient.booking_id, kind: "message",
      email: wholeClassCancelledEmail(classLabel, recipient.kind, cafe), replyTo: cafe.email, refreshPage: false,
    }) : Promise.resolve({ saved: undefined }),
  ));
  const emailSent = deliveries.filter((delivery) => delivery.status === "fulfilled" && delivery.value.saved).length;
  return { done: { bookedCount: result.bookedCount, emailSent, emailFailed: deliveries.length - emailSent } };
}

// ---------------------------------------------------------------------------
// CANCEL ONE APPOINTMENT (manage page, Version 1.7: 3 choices)
// ---------------------------------------------------------------------------

// The longest reason the database accepts (migration 10).
const MAX_NOTE = 500;

// The 3 choices, as the form sends them (admin_cancel_appointment, migration 27):
//   free      cancel + a 100% code for one class (recommended)
//   policy    the client's own cancellation rules (time left before class)
//   refunded  cancel, no code, the payment is marked refunded
const CANCEL_CHOICES = ["free", "policy", "refunded"] as const;

// The admin's message after each outcome.
const CANCEL_MESSAGES: Record<CafeCancelDetails["outcome"], string> = {
  free_code:
    "Cancelled. The client got a personal 100% code for one class (class fee, 60 days, one use).",
  half_code:
    "Cancelled under the normal policy (12 to 24 hours before class): the client got a 50% code (60 days, one use).",
  no_credit:
    "Cancelled under the normal policy (less than 12 hours before class): no credit.",
  refunded:
    "Cancelled. The payment is marked as refunded, so Earnings no longer counts it.",
};

// Cancels ONE appointment for a client, with one of the 3 choices.
// Takes: the previous state, and the form: booking_id, choice ("free",
// "policy" or "refunded") and reason (required, up to 500 characters).
// Gives back: { done } with a message, the code (if any) and whether the
// email went out, or { error }.
// The database does the cancel in one locked step (seat freed, code made,
// payment marked refunded, ONE bell update, admin log). Then the client is
// emailed from here (logged in their Communications history). A failed email
// never undoes the cancel.
export async function cancelAppointment(
  _previous: CancelAppointmentState,
  formData: FormData,
): Promise<CancelAppointmentState> {
  const bookingId = readText(formData, "booking_id");
  const choice = readText(formData, "choice");
  const reason = readText(formData, "reason");

  // Friendly first checks (the database checks them all again)
  if (!isUuid(bookingId))
    return { error: "Sorry, we couldn't find that booking." };
  if (!(CANCEL_CHOICES as readonly string[]).includes(choice)) {
    return { error: "Please choose how to cancel this appointment." };
  }
  if (!reason) return { error: "Please write a reason for cancelling." };
  if (reason.length > MAX_NOTE)
    return {
      error: `Please keep the reason to ${MAX_NOTE} characters or less.`,
    };

  const supabase = await createClient();
  // Security: check the admin role again on the server
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // The booking's class and client, read BEFORE the cancel (for the email)
  const booking = await loadBooking(supabase, bookingId);

  // The cancel itself: one locked step in the database
  const { data, error } = await supabase.rpc("admin_cancel_appointment", {
    p_booking_id: bookingId,
    p_choice: choice,
    p_reason: reason,
  });
  const result = data?.[0];
  if (error || !result) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
  }
  const outcome = result.outcome as CafeCancelDetails["outcome"];

  const email = await sendCafeCancelEmail(supabase, booking, {
    outcome,
    code: result.voucher_code ?? null,
    codeExpires: result.voucher_expires_at
      ? formatManilaDate(result.voucher_expires_at)
      : null,
  });

  // Keep the action result in the open dialog until the admin reads it.
  return {
    done: {
      message: CANCEL_MESSAGES[outcome],
      voucherCode: result.voucher_code ?? undefined,
      emailNote: email.note,
      emailSent: email.sent,
    },
  };
}

// Emails the client that the cafe cancelled their booking (only clients with
// an account and an email; walk-ins have none).
// Takes: the Supabase client, the booking (loaded before the cancel), and
// what they got (outcome, code and its last day).
// Gives back: { sent, note } where note says what happened, in plain words.
async function sendCafeCancelEmail(
  supabase: ServerClient,
  booking: AdminBookingDetails | null,
  gave: Pick<CafeCancelDetails, "outcome" | "code" | "codeExpires">,
): Promise<{ sent: boolean; note: string }> {
  if (!booking)
    return {
      sent: false,
      note: "The email wasn't sent (the booking couldn't be loaded).",
    };
  if (!booking.user_id || !booking.guest_email) {
    return {
      sent: false,
      note: "No email was sent: this is a walk-in without an account. Please tell them yourself.",
    };
  }
  const cafe = await cafeDetails();
  if (!cafe)
    return {
      sent: false,
      note: "The email wasn't sent (the cafe details couldn't be loaded).",
    };

  const result = await sendLogged(supabase, {
    userId: booking.user_id,
    kind: "message",
    bookingId: booking.booking_id,
    email: cafeCancelEmail(
      {
        name: booking.guest_name || null,
        reference: bookingReference(booking.booking_id),
        classLabel: `${formatClassDate(booking.class_date).full} · ${formatTimeRange(booking.start_time, booking.end_time)}`,
        ...gave,
      },
      cafe,
    ),
    replyTo: cafe.email,
    refreshPage: false,
  });
  return result.saved
    ? { sent: true, note: `Email sent to ${booking.guest_email}.` }
    : {
        sent: false,
        note: `${result.error ?? "The email wasn't sent."} Please message the client yourself.`,
      };
}

// ---------------------------------------------------------------------------
// RE-SCHEDULE ONE BOOKING (manage page, Version 1.6)
// ---------------------------------------------------------------------------

// Moves ONE booking to another open class, for free, with a reason.
// Takes: the previous state, and the form: booking_id, session_id (the new
// class) and reason (required, up to 500 characters).
// Gives back: { done } with the new booking's id and whether the client's
// email went out, or { error }.
// The database decides everything (admin_reschedule_booking, migration 24):
// only confirmed bookings or bookings in a class the cafe cancelled, and the
// new class must be open, not started, before the 8:00 AM cutoff and have a
// free seat (both classes locked). The client gets "Booking moved" in their
// bell from the database, and an email from here (logged in their
// Communications history). A failed email never undoes the re-schedule.
export async function rescheduleBooking(
  _previous: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const bookingId = readText(formData, "booking_id");
  const sessionId = readText(formData, "session_id");
  const reason = readText(formData, "reason");

  if (!isUuid(bookingId))
    return { error: "Sorry, we couldn't find that booking." };
  if (!isUuid(sessionId)) return { error: "Please pick the class to move to." };
  if (!reason) return { error: "Please write a reason for the re-schedule." };
  if (reason.length > MAX_NOTE)
    return {
      error: `Please keep the reason to ${MAX_NOTE} characters or less.`,
    };

  const supabase = await createClient();
  // Security: check the admin role again on the server
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // The move itself: one locked step in the database
  const { data: newBookingId, error } = await supabase.rpc(
    "admin_reschedule_booking",
    {
      p_booking_id: bookingId,
      p_new_session_id: sessionId,
      p_reason: reason,
    },
  );
  if (error || !newBookingId) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
  }

  // Both bookings, for the message and the email (old class -> new class)
  const [oldBooking, newBooking] = await Promise.all([
    loadBooking(supabase, bookingId),
    loadBooking(supabase, newBookingId),
  ]);
  const newClass = newBooking
    ? `${formatClassDate(newBooking.class_date).short} · ${formatTime(newBooking.start_time)}`
    : "the new class";
  const email = await sendRescheduleEmail(
    supabase,
    oldBooking,
    newBooking,
    reason,
  );

  // Keep the action result in the open dialog until the admin reads it.
  return {
    done: {
      message: `Re-scheduled to ${newClass}. The client was notified in their account.`,
      newBookingId,
      emailNote: email.note,
      emailSent: email.sent,
    },
  };
}

// Emails the client that their booking was moved (only for clients with an
// account and an email; walk-ins have none).
// Takes: the Supabase client, the old and new booking, and the reason.
// Gives back: { sent, note } where note says what happened, in plain words.
async function sendRescheduleEmail(
  supabase: ServerClient,
  oldBooking: AdminBookingDetails | null,
  newBooking: AdminBookingDetails | null,
  reason: string,
): Promise<{ sent: boolean; note: string }> {
  if (!oldBooking || !newBooking)
    return {
      sent: false,
      note: "The email wasn't sent (the booking couldn't be loaded).",
    };
  if (!newBooking.user_id || !newBooking.guest_email) {
    return {
      sent: false,
      note: "No email was sent: this is a walk-in without an account. Please tell them yourself.",
    };
  }
  const cafe = await cafeDetails();
  if (!cafe)
    return {
      sent: false,
      note: "The email wasn't sent (the cafe details couldn't be loaded).",
    };

  const result = await sendLogged(supabase, {
    userId: newBooking.user_id,
    kind: "message",
    bookingId: newBooking.booking_id,
    email: rescheduleEmail(
      {
        name: newBooking.guest_name || null,
        reference: bookingReference(newBooking.booking_id),
        fromClass: `${formatClassDate(oldBooking.class_date).full} · ${formatTimeRange(oldBooking.start_time, oldBooking.end_time)}`,
        toClass: `${formatClassDate(newBooking.class_date).full} · ${formatTimeRange(newBooking.start_time, newBooking.end_time)}`,
        reason,
      },
      cafe,
    ),
    replyTo: cafe.email,
    refreshPage: false,
  });
  return result.saved
    ? { sent: true, note: `Email sent to ${newBooking.guest_email}.` }
    : {
        sent: false,
        note: `${result.error ?? "The email wasn't sent."} Please message the client yourself.`,
      };
}

// Loads one booking for the email (admin_get_booking, admins only).
// Takes: the Supabase client and the booking id.
// Gives back: the booking, or null if it couldn't be loaded.
async function loadBooking(
  supabase: ServerClient,
  bookingId: string,
): Promise<AdminBookingDetails | null> {
  const { data, error } = await supabase.rpc("admin_get_booking", {
    p_booking_id: bookingId,
  });
  if (error) {
    console.error("Could not load the booking for the email:", error.message);
    return null;
  }
  // "payments" arrives as a JSON list; AdminBookingDetails describes it
  return (data[0] as unknown as AdminBookingDetails | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// REJECT A GCASH / BPI SCREENSHOT, WITH A REASON (manage page, Version 1.6)
// ---------------------------------------------------------------------------

// Rejects one manual transfer after looking at its screenshot.
// Takes: the previous state, and the form: payment_id and reason (required).
// Gives back: { saved } or { error }.
// admin_reject_payment (migration 24): payment 'rejected', booking 'expired'
// (the seat is freed), the client gets "Payment not approved" in their bell,
// and the reason is saved for admins (booking_admin_actions).
export async function rejectPayment(
  _previous: AdminSaveState,
  formData: FormData,
): Promise<AdminSaveState> {
  const paymentId = readText(formData, "payment_id");
  const reason = readText(formData, "reason");
  if (!isUuid(paymentId))
    return { error: "Sorry, we couldn't find that payment." };
  if (!reason) return { error: "Please write why the payment is rejected." };
  if (reason.length > MAX_NOTE)
    return {
      error: `Please keep the reason to ${MAX_NOTE} characters or less.`,
    };

  const supabase = await createClient();
  // Security: check the admin role again on the server
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_reject_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) return { error: friendlyDatabaseError(error) };

  return {
    saved:
      "Rejected. The seat is free again and the client sees “Payment not approved”. Please message them with the reason.",
    savedAt: Date.now(),
  };
}
