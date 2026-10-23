"use server";
// Server Actions for the My Account pages.
// Where it's used:
//   My Bookings (src/components/account/CancelBookingButton.tsx):  cancelBooking()
//   Transfer page (src/components/account/TransferForm.tsx):       transferBooking()
//   My Profile (src/components/account/ProfileForms.tsx):          updateProfileField()
//   Add your birthday (src/app/(client)/account/birthday/):         saveBirthday()
// (Change password and Deactivate my account were taken off My Profile in
// Revisions part 1. deactivate_my_account() stays in the database, unused.)
//   Notifications (src/components/account/ReminderSwitch.tsx):     setEmailReminders()
//   The header's bell (src/components/layout/NotificationBell.tsx): loadMyUpdates(),
//                                                                   markNotificationsRead()
//
// "use server" = these run ONLY on our server. The browser just sends the
// form here. The real rules live in the database: cancel_my_booking() and
// transfer_my_booking() check that the booking is the caller's own, and Row
// Level Security only lets a person change their OWN profile row.

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type {
  AccountFormState,
  CancelBookingState,
  MyUpdatesResult,
  ReminderState,
  TransferBookingState,
} from "@/lib/account/form-state";
import { safeNextPath } from "@/lib/auth/safe-next";
import { STAFF_ACCOUNT_ERROR, isStaffAccount } from "@/lib/auth/client-guard";
import { cancelTiming } from "@/lib/booking-rules";
import { loadMyBookings } from "@/lib/data/account";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import type { MyNotification } from "@/lib/data/notifications";
import { formatManilaDate } from "@/lib/format";
import { toNotificationListItem } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { isUuid, isValidBirthday, isValidInstagram, isValidMobile } from "@/lib/validation";

// Shown when the login has run out (e.g. logged out in another tab).
const LOGGED_OUT_ERROR = "Please log in again to continue.";

// ---------------------------------------------------------------------------
// CANCEL A BOOKING (My Bookings)
// ---------------------------------------------------------------------------

// Cancels one of the person's own confirmed bookings.
// Takes: the previous state, and the form: booking_id, and expected_rule =
// the rule the Cancel box was showing ("voucher" or "no_credit").
// Gives back one of:
//   { done }    cancelled: the new status, and the 50% voucher if one was given
//   { changed } the time rule is different now (e.g. the class crossed the
//               12-hour mark while the box was open): nothing was cancelled,
//               the box shows the new explanation and asks again
//   { error }   something stopped it
// Why the double check: the box explains what will happen BEFORE the person
// confirms. If that is no longer true when they click, we ask again rather
// than give them a different result than they agreed to.
export async function cancelBooking(
  _previous: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const bookingId = readText(formData, "booking_id");
  const expectedRule = readText(formData, "expected_rule");
  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }

  const supabase = await createClient();
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  // 1. Look at the booking again, as it is right now (only their own
  //    bookings are ever listed by get_my_bookings).
  let booking;
  try {
    booking = (await loadMyBookings(supabase)).find((row) => row.booking_id === bookingId);
  } catch (error) {
    console.error(error);
    return { error: GENERIC_ERROR };
  }
  if (!booking) {
    return { error: "Sorry, we couldn't find that booking." };
  }
  if (booking.status !== "confirmed" || !booking.change_rule) {
    return { error: "This booking can't be cancelled any more. Please refresh the page to see its status." };
  }

  // 2. Same rule as the box showed? If not, explain the new one first.
  //    (Also covers rules where cancelling isn't possible at all.)
  if (booking.change_rule !== expectedRule || !["voucher", "no_credit"].includes(booking.change_rule)) {
    return { changed: { rule: booking.change_rule, ...cancelTiming(booking.class_date, booking.start_time) } };
  }

  // 3. Cancel. cancel_my_booking() (migrations 3 and 8) locks the booking,
  //    checks the rule once more, and makes the 50% voucher if it's due.
  const { data, error } = await supabase.rpc("cancel_my_booking", { p_booking_id: bookingId });
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  const result = data[0];
  if (!result || (result.new_status !== "cancelled_with_voucher" && result.new_status !== "forfeited")) {
    return { error: GENERIC_ERROR };
  }

  // The page refreshes its list when the person closes the box (so they
  // can read and copy the voucher code first).
  return {
    done: {
      status: result.new_status,
      voucherCode: result.voucher_code ?? null,
      voucherExpires: result.voucher_expires_at ? formatManilaDate(result.voucher_expires_at) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// TRANSFER A BOOKING
// ---------------------------------------------------------------------------

// Moves one of the person's own confirmed bookings to another class.
// Takes: the previous state, and the form: booking_id and session_id (the
// new class they picked).
// Gives back: an error to show, or (when it works) sends them to My Bookings
// with ?moved=<new booking id>, which shows a "Done" message.
// transfer_my_booking() (migrations 3 and 8) checks everything with a lock:
// their own booking, the 24-hour and once-only rules (skipped if the cafe
// cancelled the class), and that the new class is open with a free seat.
export async function transferBooking(
  _previous: TransferBookingState,
  formData: FormData,
): Promise<TransferBookingState> {
  const bookingId = readText(formData, "booking_id");
  const sessionId = readText(formData, "session_id");
  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }
  if (!isUuid(sessionId)) {
    return { error: "Please pick the class you want to move to." };
  }

  const supabase = await createClient();
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };
  const { data: newBookingId, error } = await supabase.rpc("transfer_my_booking", {
    p_booking_id: bookingId,
    p_new_session_id: sessionId,
  });
  if (error || !newBookingId) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
  }

  // redirect() must be the last step (never inside try/catch)
  redirect(`/account/bookings?moved=${newBookingId}`);
}

// ---------------------------------------------------------------------------
// MY PROFILE: edit one detail (name, mobile or Instagram)
// ---------------------------------------------------------------------------

// The details a client may edit on My Profile (their column names).
// (Revisions part 1, item 7: ONLY these three. The email and birthday are
// read-only there; the database blocks changing them too, migration 12.)
const EDITABLE_FIELDS = ["full_name", "mobile", "instagram"] as const;

// Saves ONE of the person's details (the pen icon on My Profile).
// Takes: the previous state, and the form: field (full_name, mobile or
// instagram) and value.
// Gives back: a field error, a general error, or a success message, with the
// value as it was saved (so the row can show it straight away).
export async function updateProfileField(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const field = readText(formData, "field");
  // Squash double spaces ("Juan  Cruz" -> "Juan Cruz")
  const value = readText(formData, "value").replace(/\s+/g, " ");
  const values = { value };

  // Only the three editable details; anything else is refused
  if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) {
    return { error: "That detail can't be changed here.", values };
  }

  // Check the new value, with the same rules as sign-up and booking
  let problem: string | null = null;
  if (field === "full_name") {
    if (!value) problem = "Please enter your full name.";
    else if (value.length > 120) problem = "Please use 120 characters or fewer.";
  } else if (field === "mobile") {
    if (!isValidMobile(value)) problem = "Please enter a valid mobile number, for example 0917 123 4567.";
  } else if (value && !isValidInstagram(value)) {
    problem = "Please enter just your Instagram name, for example @yourname.";
  }
  if (problem) {
    return { fieldErrors: { value: problem }, values };
  }

  const supabase = await createClient();
  const userId = await loggedInUserId(supabase);
  if (!userId) return { error: LOGGED_OUT_ERROR, values };
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR, values };

  // Instagram is saved without the "@" (and empty = none)
  const saved = field === "instagram" ? value.replace(/^@/, "") || null : value;
  // The one column to change (written out, so TypeScript checks each name)
  const change =
    field === "full_name" ? { full_name: value } : field === "mobile" ? { mobile: value } : { instagram: saved };

  // Row Level Security only lets them change their OWN row; the database
  // triggers block role / is_active (migration 2) and email / birthday
  // (migration 12) anyway.
  const { error } = await supabase
    .from("profiles")
    .update(change)
    .eq("id", userId);
  if (error) {
    console.error("Profile was not saved:", error.code);
    return { error: GENERIC_ERROR, values };
  }

  // Draw the page again, so the header and the avatar show the new name
  refresh();
  return { success: "Saved.", values: { value: saved ?? "" } };
}

// ---------------------------------------------------------------------------
// MY BIRTHDAY: saved once (the /account/birthday page)
// ---------------------------------------------------------------------------

// Saves the person's birthday, for accounts that don't have one yet.
// Takes: the previous state, and the form: birthday (YYYY-MM-DD) and next
// (the page they were going to, checked by safeNextPath()).
// Gives back: a field error or a general error, or (when it works) sends
// them on to "next" (or My Profile).
// The database only allows this ONCE: a saved birthday can't be changed
// from the website (migration 12's trigger), so this can't be used to edit it.
export async function saveBirthday(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const birthday = readText(formData, "birthday");
  const next = safeNextPath(formData.get("next"));
  const values = { birthday };

  if (!isValidBirthday(birthday)) {
    return { fieldErrors: { birthday: "Please pick a real date in the past." }, values };
  }

  const supabase = await createClient();
  const userId = await loggedInUserId(supabase);
  if (!userId) return { error: LOGGED_OUT_ERROR, values };
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR, values };

  // Only fills it in when it's still empty (.is("birthday", null)), so a
  // second click or an old tab changes nothing
  const { error } = await supabase.from("profiles").update({ birthday }).eq("id", userId).is("birthday", null);
  if (error) {
    // The trigger's own messages (e.g. "already saved") are plain English
    return { error: friendlyDatabaseError(error), values };
  }

  // On to where they were going (redirect() must be last, outside try/catch)
  redirect(next ?? "/account/profile");
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS: day-before reminder on / off
// ---------------------------------------------------------------------------

// Turns the day-before reminder email on or off (profiles.email_reminders).
// Takes: the previous state, and the form: value = "true" or "false".
// Gives back: { value } (the saved choice) or { error, value } (unchanged).
export async function setEmailReminders(previous: ReminderState, formData: FormData): Promise<ReminderState> {
  const value = formData.get("value") === "true";

  const supabase = await createClient();
  const userId = await loggedInUserId(supabase);
  if (!userId) return { error: LOGGED_OUT_ERROR, value: previous.value };
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR, value: previous.value };

  // Row Level Security: only their own row can be changed
  const { error } = await supabase.from("profiles").update({ email_reminders: value }).eq("id", userId);
  if (error) {
    console.error("Reminder choice was not saved:", error.code);
    return { error: GENERIC_ERROR, value: previous.value };
  }
  return { value };
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS: mark the in-app updates as read
// ---------------------------------------------------------------------------

// Loads the person's own updates for the header's bell (Change 17).
// Takes: nothing.
// Gives back: { updates } (up to 50, newest first, with their words already
// written) or { error }. Only loaded when the bell is opened, so normal page
// visits only pay for the small unread count.
// get_my_notifications() only ever gives back the caller's OWN rows.
export async function loadMyUpdates(): Promise<MyUpdatesResult> {
  const supabase = await createClient();
  if (!(await loggedInUserId(supabase))) return { error: LOGGED_OUT_ERROR };
  // Admin accounts don't use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: 50 });
  if (error) {
    console.error("Could not load notifications:", error.code);
    return { error: "Sorry, we couldn't load your updates. Please try again." };
  }
  // The generated type says no column is ever empty; MyNotification says
  // which ones can be.
  return { updates: (data as MyNotification[]).map(toNotificationListItem) };
}

// Marks all of the person's own notifications as read (migration 12).
// Takes: nothing.
// Gives back: nothing. Called by the bell (NotificationBell.tsx) right AFTER
// it has shown the list, so the "New" labels are seen first.
// mark_my_notifications_read() only ever touches the caller's OWN rows. A
// problem is only logged: the updates just stay "new" until the next time.
export async function markNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_my_notifications_read");
  if (error) {
    console.error("Notifications were not marked as read:", error.code);
  }
}

// ---------------------------------------------------------------------------
// Small helpers (not exported, so the browser can't call them)
// ---------------------------------------------------------------------------

// Finds out who is logged in.
// Takes: a Supabase client.
// Gives back: their user id, or null if the login has run out. getClaims()
// checks the login token's signature, so a fake cookie gives null.
async function loggedInUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

// Reads a text field from a form and trims spaces from both ends.
// Takes: the form data and the field name.
// Gives back: the text, or "" if it's missing.
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
