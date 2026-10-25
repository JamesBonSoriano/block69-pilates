"use server";
// Server Actions for the admin's one-user pages (Version 1.4 admin part 2).
// Where it's used (through AdminActionForm):
//   Edit user       (src/app/admin/(panel)/users/[userId]/edit/):           updateUser()
//   Communications  (src/app/admin/(panel)/users/[userId]/communications/): sendUserMessage(), resendConfirmation()
//
// "use server" = these run ONLY on our server. Each one checks the form,
// checks AGAIN that the caller is an active admin (is_admin()), then works
// through the admin_* database functions (migration 20), which check
// everything a third time.
//
// Sending an email has three steps, so the history is always right:
//   1. admin_start_message() checks it and logs it as 'sending' (the
//      database gives back the client's email address, so a changed form
//      can't send to someone else),
//   2. sendEmail() sends it with Gmail (src/lib/email.ts, never throws),
//   3. admin_finish_message() marks it 'sent' or 'failed'.
// A failed email never breaks the page: the admin sees a plain message and
// the history shows "Failed" with the reason.

import { refresh } from "next/cache";
import { NOT_ADMIN, isAdmin, readText, type ServerClient } from "@/lib/admin/action-helpers";
import type { AdminSaveState } from "@/lib/admin/form-state";
import { bookingReference } from "@/lib/booking-rules";
import { friendlyDatabaseError } from "@/lib/database-errors";
import { getPublicSettings } from "@/lib/data/settings";
import { EMAIL_NOT_SET_UP, emailIsSetUp, sendEmail } from "@/lib/email";
import { adminMessageEmail, confirmationEmail, type EmailCafe, type EmailText } from "@/lib/email-text";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  BIRTHDAY_ERROR,
  PH_MOBILE_ERROR,
  isUuid,
  isValidInstagram,
  isValidPhMobile,
  normalizePhMobile,
  parseBirthdayInput,
} from "@/lib/validation";

// The longest message the admin may type (the database allows 5000
// characters for the whole email, and the sign-off is added to it).
const MAX_MESSAGE = 4000;

// ---------------------------------------------------------------------------
// EDIT USER
// ---------------------------------------------------------------------------

// Saves a client's name, mobile, Instagram and birthday.
// Takes: the previous state, and the form: user_id, full_name, mobile,
// instagram (optional) and birthday (MM/DD/YYYY, optional).
// Gives back: { saved } or { error }. The email and the role can't be
// changed here (the database function doesn't even take them).
export async function updateUser(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const userId = readText(formData, "user_id");
  const fullName = readText(formData, "full_name").replace(/\s+/g, " ");
  const mobile = readText(formData, "mobile");
  const instagram = readText(formData, "instagram");
  const birthdayText = readText(formData, "birthday");

  // Friendly first checks (the same rules as sign-up; the database checks again)
  if (!isUuid(userId)) return { error: "Sorry, we don't know which account to save." };
  if (!fullName) return { error: "Please enter the full name." };
  if (fullName.length > 120) return { error: "Please use 120 characters or fewer for the name." };
  if (!isValidPhMobile(mobile)) return { error: PH_MOBILE_ERROR };
  if (instagram && !isValidInstagram(instagram)) {
    return { error: "Please enter just the Instagram name, for example @yourname." };
  }
  // Empty = no birthday; anything typed must be a real past MM/DD/YYYY date
  const birthday = birthdayText ? parseBirthdayInput(birthdayText) : null;
  if (birthdayText && !birthday) return { error: BIRTHDAY_ERROR };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_update_user", {
    p_user_id: userId,
    p_full_name: fullName,
    p_mobile: normalizePhMobile(mobile),
    // The database takes the "@" off and turns "" into "no Instagram"
    p_instagram: instagram,
    // A missing birthday is sent as null (the generated type only says string)
    p_birthday: birthday as string,
  });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  return done("Details saved.");
}

// ---------------------------------------------------------------------------
// COMMUNICATIONS
// ---------------------------------------------------------------------------

// Sends the client a message the admin typed.
// Takes: the previous state, and the form: user_id, subject and message.
// Gives back: { saved } when the email went out, or { error } with a plain
// reason (the history shows the failed try too).
export async function sendUserMessage(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const userId = readText(formData, "user_id");
  const subject = readText(formData, "subject");
  const message = readText(formData, "message");

  if (!isUuid(userId)) return { error: "Sorry, we don't know who to send this to." };
  if (!subject) return { error: "Please type a subject." };
  if (subject.length > 150) return { error: "Please keep the subject to 150 characters or fewer." };
  if (!message) return { error: "Please type a message." };
  if (message.length > MAX_MESSAGE) return { error: `Please keep the message to ${MAX_MESSAGE} characters or fewer.` };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const cafe = await cafeDetails();
  if (!cafe) return { error: CAFE_DETAILS_ERROR };

  return sendLogged(supabase, {
    userId,
    kind: "message",
    bookingId: null,
    email: adminMessageEmail(subject, message, cafe),
    replyTo: cafe.email,
  });
}

// Sends the "You're booked" email again for one of the client's bookings.
// Takes: the previous state, and the form: user_id and booking_id.
// Gives back: { saved } or { error }. Only confirmed (or attended) bookings
// of THIS client (the database checks both).
export async function resendConfirmation(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const userId = readText(formData, "user_id");
  const bookingId = readText(formData, "booking_id");
  if (!isUuid(userId)) return { error: "Sorry, we don't know who to send this to." };
  if (!isUuid(bookingId)) return { error: "Please choose a booking." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // The booking's details for the email (admin_get_booking, migration 9)
  const { data, error } = await supabase.rpc("admin_get_booking", { p_booking_id: bookingId });
  const booking = data?.[0];
  if (error || !booking) return { error: "We couldn't find that booking. Please refresh the page." };
  if (booking.user_id !== userId) return { error: "That booking doesn't belong to this client." };

  const cafe = await cafeDetails();
  if (!cafe) return { error: CAFE_DETAILS_ERROR };

  const email = confirmationEmail(
    {
      name: booking.guest_name || null,
      reference: bookingReference(booking.booking_id),
      classDate: formatClassDate(booking.class_date).full,
      classTime: formatTimeRange(booking.start_time, booking.end_time),
      // The generated type says text, but it's empty when no drink was picked
      drink: (booking.drink_choice as string | null) || null,
      matRental: booking.mat_rental,
      total: formatPeso(Number(booking.total)),
    },
    cafe,
  );
  return sendLogged(supabase, { userId, kind: "confirmation", bookingId, email, replyTo: cafe.email });
}

// ---------------------------------------------------------------------------
// Helpers (not exported: only the actions above may use them)
// ---------------------------------------------------------------------------

// Shown when the cafe's settings couldn't be loaded for the sign-off.
const CAFE_DETAILS_ERROR = "We couldn't load the cafe details for the email. Please try again in a moment.";

// Loads the cafe details every email ends with (from Settings).
// Takes: nothing. Gives back: the details, or null if they couldn't load.
async function cafeDetails(): Promise<EmailCafe | null> {
  try {
    const settings = await getPublicSettings();
    return { name: settings.cafeName, address: settings.cafeAddress, email: settings.cafeEmail };
  } catch (error) {
    console.error(error);
    return null;
  }
}

// Logs, sends and finishes one email (the three steps at the top of the file).
// Takes: the Supabase client and { userId, kind, bookingId, email, replyTo }.
// Gives back: { saved } if it went out, otherwise { error }.
async function sendLogged(
  supabase: ServerClient,
  message: {
    userId: string;
    kind: "message" | "confirmation";
    bookingId: string | null;
    email: EmailText;
    replyTo: string;
  },
): Promise<AdminSaveState> {
  // No SMTP keys yet: say so, and don't fill the history with failed tries
  if (!emailIsSetUp()) return { error: EMAIL_NOT_SET_UP };

  // 1. Check and log it; the database gives back the address
  const { data, error } = await supabase.rpc("admin_start_message", {
    p_user_id: message.userId,
    p_kind: message.kind,
    p_subject: message.email.subject,
    p_body: message.email.text,
    p_booking_id: message.bookingId ?? undefined,
  });
  const started = data?.[0];
  if (error || !started) return { error: error ? friendlyDatabaseError(error) : "The message could not be saved." };

  // 2. Send it (never throws)
  const result = await sendEmail({
    to: started.to_email,
    subject: message.email.subject,
    text: message.email.text,
    replyTo: message.replyTo,
  });

  // 3. Mark it sent or failed (if this fails, the row just stays "Sending")
  const { error: finishError } = await supabase.rpc("admin_finish_message", {
    p_message_id: started.message_id,
    p_sent: result.ok,
    p_error: result.ok ? undefined : result.error,
  });
  if (finishError) console.error("Could not finish the message log:", finishError.message);

  refresh();
  if (!result.ok) {
    return { error: `The email wasn't sent: ${result.error} It shows as "Failed" in the history.` };
  }
  const what = message.kind === "confirmation" ? "Confirmation" : "Message";
  return done(`${what} sent to ${started.to_email}.`);
}

// A success answer.
// Takes: the message. Gives back: { saved, savedAt }.
function done(message: string): AdminSaveState {
  return { saved: message, savedAt: Date.now() };
}
