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
import { NOT_ADMIN, isAdmin, readText } from "@/lib/admin/action-helpers";
import type { AdminSaveState } from "@/lib/admin/form-state";
import { CAFE_DETAILS_ERROR, cafeDetails, sendLogged } from "@/lib/admin/logged-email";
import { bookingReference } from "@/lib/booking-rules";
import { friendlyDatabaseError } from "@/lib/database-errors";
import { adminMessageEmail, confirmationEmail } from "@/lib/email-text";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { emailIsSetUp, EMAIL_NOT_SET_UP, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  BIRTHDAY_ERROR,
  birthdayInputProblem,
  PH_MOBILE_ERROR,
  isUuid,
  isAllowedEmailDomain,
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
  // Empty = no birthday; anything typed must be a real MM/DD/YYYY date of
  // someone at least 18 years old (Version 1.6; the database checks again)
  const birthdayProblem = birthdayText ? birthdayInputProblem(birthdayText) : null;
  if (birthdayProblem) return { error: birthdayProblem };
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

// A success answer.
// Takes: the message. Gives back: { saved, savedAt }.
function done(message: string): AdminSaveState {
  return { saved: message, savedAt: Date.now() };
}

// Updates only the active flag; the database clears any self-reactivation marker.
export async function setClientActive(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const userId = readText(formData, "user_id");
  const active = readText(formData, "active");
  if (!isUuid(userId) || (active !== "yes" && active !== "no")) return { error: "Invalid account change." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };
  const { data: profiles, error: lookupError } = await supabase.rpc("admin_get_user", { p_user_id: userId });
  if (lookupError || profiles?.[0]?.role !== "client") return { error: "Choose a client account." };
  const { error } = await supabase.rpc("admin_set_user_active", { p_user_id: userId, p_active: active === "yes" });
  if (error) return { error: friendlyDatabaseError(error) };
  refresh();
  return done(active === "yes" ? "Account reactivated." : "Account deactivated.");
}

// Sends recovery only to the verified address read from Supabase Auth.
export async function sendClientPasswordReset(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  return sendRecovery(formData, "recovery");
}

// Asks Auth to stage a replacement and sends proof only to the replacement inbox.
export async function sendClientEmailChange(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  return sendRecovery(formData, "email_change_new");
}

// Authorizes the target, generates an Auth verification link, and records delivery without the token.
async function sendRecovery(formData: FormData, kind: "recovery" | "email_change_new"): Promise<AdminSaveState> {
  const userId = readText(formData, "user_id");
  const replacement = readText(formData, "new_email").toLowerCase();
  if (!isUuid(userId)) return { error: "Choose a client account." };
  if (kind === "email_change_new" && !isAllowedEmailDomain(replacement)) {
    return { error: "Enter the replacement Gmail or Yahoo email address." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };
  const { data: profiles, error: lookupError } = await supabase.rpc("admin_get_user", { p_user_id: userId });
  const profile = profiles?.[0];
  if (lookupError || profile?.role !== "client" || profile.is_deleted) return { error: "Choose a current client account." };
  if (!emailIsSetUp()) return { error: EMAIL_NOT_SET_UP };

  try {
    const admin = createServiceClient().auth.admin;
    const { data, error } = await admin.getUserById(userId);
    const authUser = data.user;
    const current = authUser?.email?.toLowerCase();
    if (error || !authUser?.email_confirmed_at || !current || current !== profile.email?.toLowerCase()) {
      return { error: "The client needs a current verified email before staff can send recovery." };
    }
    if (kind === "email_change_new" && current === replacement) return { error: "Enter a different email address." };

    const reset = kind === "recovery";
    const subject = reset ? "Reset your Block 69 Cafe password" : "Verify your replacement Block 69 Cafe email";
    const recipient = reset ? current : replacement;
    const { data: logRows, error: logError } = await supabase.rpc("admin_start_message", {
      p_user_id: userId, p_kind: "message", p_subject: subject,
      p_body: `Staff requested ${reset ? "a password reset" : "email-change verification"} for ${recipient}. The verification link is omitted from history.`,
    });
    const audit = logRows?.[0];
    if (logError || !audit) return { error: "Could not log the recovery request." };

    let sent = false;
    let failure = "Could not generate or deliver the verification link.";
    try {
      // Recheck the stored address returned while opening the audit record.
      if (audit.to_email.toLowerCase() !== current) throw new Error("Email changed during recovery");
      const generated = await admin.generateLink(reset
        ? { type: "recovery", email: current }
        : { type: "email_change_new", email: current, newEmail: replacement });
      if (generated.error || generated.data.user?.id !== userId || !generated.data.properties?.hashed_token) {
        throw new Error("Auth did not issue a link for this client");
      }
      const link = new URL("/auth/confirm", getSiteUrl());
      link.searchParams.set("type", reset ? "recovery" : "email_change");
      link.searchParams.set("token_hash", generated.data.properties.hashed_token);
      const delivery = await sendEmail({
        to: recipient, subject,
        text: reset
          ? `Use this one-time link to reset your password:\n${link}\n\nIf you did not request this, contact the cafe.`
          : `Use this one-time link to verify your replacement email:\n${link}\n\nYour current sign-in address stays active until the change is verified.`,
      });
      sent = delivery.ok;
      if (!sent) failure = "Email delivery failed. Check the mail configuration and try again.";
    } catch {
      // Never log the provider response, generated URL, or token.
    }
    const { error: finishError } = await supabase.rpc("admin_finish_message", {
      p_message_id: audit.message_id, p_sent: sent, p_error: sent ? undefined : failure,
    });
    refresh();
    if (finishError) return { error: sent ? "Email sent, but the recovery audit status could not be saved." : failure };
    return sent ? done(reset ? "Password reset sent to the current verified email." : "Verification sent to the replacement email.") : { error: failure };
  } catch {
    return { error: "Recovery is unavailable. Check the server Auth configuration." };
  }
}
