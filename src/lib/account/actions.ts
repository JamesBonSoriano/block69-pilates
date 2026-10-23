"use server";
// Server Actions for the My Account pages.
// Where it's used:
//   My Bookings (src/components/account/CancelBookingButton.tsx):  cancelBooking()
//   Transfer page (src/components/account/TransferForm.tsx):       transferBooking()
//   My Profile (src/components/account/ProfileForms.tsx):          updateProfile(),
//                                                                  changePassword(),
//                                                                  deactivateAccount()
//   Notifications (src/components/account/ReminderSwitch.tsx):     setEmailReminders()
//
// "use server" = these run ONLY on our server. The browser just sends the
// form here. The real rules live in the database: cancel_my_booking(),
// transfer_my_booking() and deactivate_my_account() check that the booking or
// account is the caller's own, and Row Level Security only lets a person
// change their OWN profile row.
//
// SECURITY: passwords are never logged, never sent back to the page, and
// never kept in "values".

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type {
  AccountFormState,
  CancelBookingState,
  ReminderState,
  TransferBookingState,
} from "@/lib/account/form-state";
import { MIN_PASSWORD_LENGTH, friendlyAuthError } from "@/lib/auth/errors";
import { STAFF_ACCOUNT_ERROR, isStaffAccount } from "@/lib/auth/client-guard";
import { cancelTiming } from "@/lib/booking-rules";
import { loadMyBookings } from "@/lib/data/account";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import { formatManilaDate } from "@/lib/format";
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
// MY PROFILE: personal details
// ---------------------------------------------------------------------------

// Saves the person's name, mobile, Instagram and birthday.
// Takes: the previous state, and the form: full_name, mobile, instagram
// (optional), birthday (optional, YYYY-MM-DD).
// Gives back: field errors, a general error, or a success message.
// The email can't be changed here (it's the login email; see My Profile).
export async function updateProfile(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  // Squash double spaces in the name ("Juan  Cruz" -> "Juan Cruz")
  const fullName = readText(formData, "full_name").replace(/\s+/g, " ");
  const mobile = readText(formData, "mobile");
  const instagram = readText(formData, "instagram");
  const birthday = readText(formData, "birthday");
  const values = { full_name: fullName, mobile, instagram, birthday };

  // Check every field first, so the person sees all problems at once
  const fieldErrors: Record<string, string> = {};
  if (!fullName) {
    fieldErrors.full_name = "Please enter your full name.";
  } else if (fullName.length > 120) {
    fieldErrors.full_name = "Please use 120 characters or fewer.";
  }
  if (!isValidMobile(mobile)) {
    fieldErrors.mobile = "Please enter a valid mobile number, for example 0917 123 4567.";
  }
  if (instagram && !isValidInstagram(instagram)) {
    fieldErrors.instagram = "Please enter just your Instagram name, for example @yourname.";
  }
  if (birthday && !isValidBirthday(birthday)) {
    fieldErrors.birthday = "Please pick a real date in the past.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createClient();
  const userId = await loggedInUserId(supabase);
  if (!userId) return { error: LOGGED_OUT_ERROR, values };
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR, values };

  // Row Level Security only lets them change their OWN row, and the
  // database trigger (migration 2) blocks role / is_active changes anyway.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      mobile,
      instagram: instagram.replace(/^@/, "") || null, // saved without the "@"
      birthday: birthday || null,
    })
    .eq("id", userId);
  if (error) {
    console.error("Profile was not saved:", error.code);
    return { error: GENERIC_ERROR, values };
  }

  // Draw the page again, so the header shows the new name straight away
  refresh();
  return { success: "Your details are saved.", values };
}

// ---------------------------------------------------------------------------
// MY PROFILE: change password
// ---------------------------------------------------------------------------

// Changes the person's password, after checking their CURRENT password.
// Takes: the previous state, and the form: current_password, new_password,
// confirm_password.
// Gives back: field errors, a general error, or a success message.
// The current password is checked by Supabase itself: we send it as
// current_password, and the project setting "Require current password when
// updating" (Authentication > Providers > Email) makes Supabase refuse a
// wrong one. (Forgot password links are allowed without it, by Supabase's
// design, so /reset-password keeps working.)
export async function changePassword(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const currentPassword = readPassword(formData, "current_password");
  const newPassword = readPassword(formData, "new_password");
  const confirmPassword = readPassword(formData, "confirm_password");

  const fieldErrors: Record<string, string> = {};
  if (!currentPassword) {
    fieldErrors.current_password = "Please enter your current password.";
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.new_password = `Please use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (newPassword === currentPassword) {
    fieldErrors.new_password = "Please choose a password that's different from your current one.";
  }
  if (confirmPassword !== newPassword) {
    fieldErrors.confirm_password = "The two new passwords don't match.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  if (!(await loggedInUserId(supabase))) return { error: LOGGED_OUT_ERROR };

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (error) {
    // A wrong current password belongs next to that field
    if (error.code === "current_password_mismatch" || error.code === "current_password_required") {
      return { fieldErrors: { current_password: friendlyAuthError(error) } };
    }
    // Log only the error code, never the passwords
    console.error("Password was not changed:", error.code ?? error.status);
    return { error: friendlyAuthError(error) };
  }

  return { success: "Your password has been changed. Use the new one next time you log in." };
}

// ---------------------------------------------------------------------------
// MY PROFILE: deactivate my account
// ---------------------------------------------------------------------------

// Deactivates the person's own account, then logs them out everywhere.
// Takes: the previous state, and the form: confirm = "on" (the "I understand"
// tick in the confirm step).
// Gives back: an error to show, or (when it works) sends them to
// /auth/deactivated, which logs them out on all devices and shows the login
// page with a message. Only the cafe (an admin) can reactivate the account.
export async function deactivateAccount(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  if (formData.get("confirm") !== "on") {
    return { fieldErrors: { confirm: "Please tick this to confirm." } };
  }

  const supabase = await createClient();
  // deactivate_my_account() (migration 3) only ever changes the caller's own row
  const { error } = await supabase.rpc("deactivate_my_account");
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }

  redirect("/auth/deactivated");
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

// Reads a password field exactly as typed (spaces count in passwords).
// Takes: the form data and the field name.
// Gives back: the password, or "" if it's missing.
function readPassword(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
