"use server";
// Server Actions for the My Account pages.
// Where it's used:
//   My Bookings (src/components/account/CancelBookingButton.tsx):  cancelBooking()
//   Transfer page (src/components/account/TransferForm.tsx):       transferBooking()
//   My Profile (src/components/account/ProfileForms.tsx):          updateProfileField()
//   My Profile (src/components/account/AccountSettingsForms.tsx):  startEmailChange(),
//     confirmEmailChange(), changePassword(), deactivateAccount(), deleteAccount()
//     (Change 17 brought Change password and Deactivate back, and added the
//     email change and Delete account; Version 1.4 made the email change one code)
//   Welcome back (src/components/auth/ReactivateForm.tsx):           reactivateAccount()
//   Finish your profile (src/app/(client)/account/finish-profile/): finishProfile()
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
  EmailChangeState,
  MyUpdatesResult,
  ReminderState,
  TransferBookingState,
} from "@/lib/account/form-state";
import { STAFF_ACCOUNT_ERROR, isStaffAccount } from "@/lib/auth/client-guard";
import { friendlyAuthError } from "@/lib/auth/errors";
import { checkCurrentPassword } from "@/lib/auth/password-check";
import { safeNextPath } from "@/lib/auth/safe-next";
import { hasPasswordLogin } from "@/lib/auth/sign-in-methods";
import { cancelTiming } from "@/lib/booking-rules";
import { loadMyBookings } from "@/lib/data/account";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import type { MyNotification } from "@/lib/data/notifications";
import { formatManilaDate } from "@/lib/format";
import { toNotificationListItem } from "@/lib/notifications";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BIRTHDAY_ERROR,
  EMAIL_DOMAIN_ERROR,
  MIN_PASSWORD,
  PH_MOBILE_ERROR,
  isAllowedEmailDomain,
  isUuid,
  isValidEmail,
  isValidInstagram,
  isValidPhMobile,
  normalizePhMobile,
  parseBirthdayInput,
} from "@/lib/validation";

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
  // (Late payments have the rule "late_payment": they move, never cancel here)
  if (booking.status !== "confirmed" || !booking.change_rule || booking.change_rule === "late_payment") {
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

// Moves one of the person's own confirmed (or late-paid) bookings to another class.
// Takes: the previous state, and the form: booking_id and session_id (the
// new class they picked).
// Gives back: an error to show, or (when it works) sends them to My Bookings
// with ?moved=<new booking id>, which shows a "Done" message.
// transfer_my_booking() (migrations 3, 8 and 19) checks everything with a
// lock: their own booking, the 24-hour and once-only rules (skipped if the
// cafe cancelled the class, or for a late payment that covers the total),
// and that the new class is open with a free seat.
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
// Change 17 adds the birthday (migration 16 lets clients change it). The
// EMAIL is not here: it changes through Supabase's verified flow
// (startEmailChange / confirmEmailChange below).
const EDITABLE_FIELDS = ["full_name", "mobile", "instagram", "birthday"] as const;

// Saves ONE of the person's details (the pen icon on My Profile).
// Takes: the previous state, and the form: field (full_name, mobile,
// instagram or birthday, typed MM/DD/YYYY) and value.
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
    // Change 17: 11 digits starting with 09, the same rule as sign-up
    if (!isValidPhMobile(value)) problem = PH_MOBILE_ERROR;
  } else if (field === "birthday") {
    // Change 17: a real past date typed MM/DD/YYYY (the database checks too)
    if (!parseBirthdayInput(value)) problem = BIRTHDAY_ERROR;
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

  // Instagram is saved without the "@" (and empty = none); the mobile number
  // without spaces or dashes ("09171234567"); the birthday as "YYYY-MM-DD"
  const saved =
    field === "instagram"
      ? value.replace(/^@/, "") || null
      : field === "mobile"
        ? normalizePhMobile(value)
        : field === "birthday"
          ? parseBirthdayInput(value)
          : value;
  // The one column to change (written out, so TypeScript checks each name)
  const change =
    field === "full_name"
      ? { full_name: value }
      : field === "mobile"
        ? { mobile: saved ?? "" }
        : field === "birthday"
          ? { birthday: saved }
          : { instagram: saved };

  // Row Level Security only lets them change their OWN row; the database
  // triggers block role / is_active (migration 2) and the email, and check
  // the birthday (migration 16) anyway.
  const { error } = await supabase
    .from("profiles")
    .update(change)
    .eq("id", userId);
  if (error) {
    console.error("Profile was not saved:", error.code);
    // The birthday trigger's own messages are plain English
    return { error: field === "birthday" ? friendlyDatabaseError(error) : GENERIC_ERROR, values };
  }

  // Draw the page again, so the header and the avatar show the new name
  refresh();
  return { success: "Saved.", values: { value: saved ?? "" } };
}

// ---------------------------------------------------------------------------
// CHANGE EMAIL, with ONE 6-digit code (My Profile > Account Information)
// ---------------------------------------------------------------------------
// How it works (Version 1.4; "Secure email change" must be OFF in Supabase):
//   1. startEmailChange(): checks the current password, then Supabase's
//      updateUser({ email }) sends ONE 6-digit code, only to the NEW email.
//      Nothing changes yet.
//   2. confirmEmailChange(): the code is checked with verifyOtp(type
//      "email_change"). Supabase changes the login email, and the database
//      copies it into profiles.email (migration 16's trigger).
//   3. A security alert goes to the OLD email ("Your Block 69 email was
//      changed..."): Supabase's own "Email address changed" notification
//      (Authentication > Emails, needs our own email sender, Step 14).
// The code email needs the "Change Email Address" template to show {{ .Token }}.

// Starts an email change: checks the password and sends the code.
// Takes: the previous state, and the form: current_password (only for
// accounts that have a password; Google-only accounts have none) and new_email.
// Gives back: { step: "code" } when the code was sent, or an error.
// The new email must be @gmail.com or @yahoo.com (this version's rule).
// The password is never sent back to the page.
export async function startEmailChange(_previous: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const newEmail = readText(formData, "new_email").toLowerCase();
  const password = readPassword(formData, "current_password");

  if (!isValidEmail(newEmail)) {
    return { step: "start", newEmail, fieldErrors: { new_email: "Please enter a valid email address." } };
  }
  if (!isAllowedEmailDomain(newEmail)) {
    return { step: "start", newEmail, fieldErrors: { new_email: EMAIL_DOMAIN_ERROR } };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { step: "start", newEmail, error: LOGGED_OUT_ERROR };
  if (await isStaffAccount(supabase)) return { step: "start", newEmail, error: STAFF_ACCOUNT_ERROR };
  if (user.email?.toLowerCase() === newEmail) {
    return { step: "start", newEmail, fieldErrors: { new_email: "That's already your email." } };
  }

  // SECURITY: the current password first (checkCurrentPassword() doesn't
  // touch their login), so someone using a phone left logged in can't move
  // the account to their own email
  if (hasPasswordLogin(user)) {
    if (!password) {
      return { step: "start", newEmail, fieldErrors: { current_password: "Please enter your current password." } };
    }
    const check = await checkCurrentPassword(user.email ?? "", password);
    if (check === "wrong") {
      return { step: "start", newEmail, fieldErrors: { current_password: "Your current password isn't right." } };
    }
    if (check === "error") {
      return { step: "start", newEmail, error: "We couldn't check your password right now. Please try again in a few minutes." };
    }
  }

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    // Only used if the email shows a link instead of a code
    { emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/account/profile")}` },
  );
  if (error) {
    // e.g. "email_exists" (another account uses it) or too many tries
    return {
      step: "start",
      newEmail,
      error:
        error.code === "email_exists"
          ? "Another account already uses that email."
          : friendlyAuthError(error),
    };
  }
  return { step: "code", newEmail };
}

// Finishes an email change: checks the code sent to the new email.
// Takes: the previous state, and the form: new_email and code.
// Gives back: { step: "done" } once the login email has changed, or
// { step: "code" } with a message (a wrong or old code).
export async function confirmEmailChange(_previous: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const newEmail = readText(formData, "new_email").toLowerCase();
  // Codes are digits only; spaces people type between them are taken out
  const code = readText(formData, "code").replace(/\s/g, "");
  const codeStep = { step: "code" as const, newEmail };

  if (!/^\d{6}$/.test(code)) {
    return { ...codeStep, fieldErrors: { code: "Please enter the 6-digit code sent to your new email." } };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) return { ...codeStep, error: LOGGED_OUT_ERROR };
  if (await isStaffAccount(supabase)) return { ...codeStep, error: STAFF_ACCOUNT_ERROR };

  const { error } = await supabase.auth.verifyOtp({ email: newEmail, token: code, type: "email_change" });
  if (error) return { ...codeStep, fieldErrors: { code: friendlyAuthError(error) } };

  // Did the login email change? If Supabase still waits for a second code,
  // "Secure email change" is still ON in the dashboard (see docs/PROGRESS.md)
  const { data: after } = await supabase.auth.getUser();
  if (after.user?.email?.toLowerCase() !== newEmail) {
    console.error('Email change needs a second code: turn OFF "Secure email change" in Supabase.');
    return { ...codeStep, error: "Your new email isn't confirmed yet. Please message the cafe with Chat With Us." };
  }

  // TODO(Step 14): if Supabase's "Email address changed" notification can't
  // be turned on, send our own alert to the OLD email (user.email) here:
  // "Your Block 69 email was changed. If this wasn't you, contact us."

  // Draw the page again with the new email (profiles.email was synced by the
  // database trigger, migration 16)
  refresh();
  return { step: "done", newEmail };
}

// ---------------------------------------------------------------------------
// CHANGE PASSWORD (My Profile > Account Information, Change 17)
// ---------------------------------------------------------------------------

// Changes the person's password.
// Takes: the previous state, and the form: current_password, new_password
// and confirm_password.
// Gives back: field errors, a general error, or a success message.
// The CURRENT password is checked first (checkCurrentPassword(), which doesn't
// touch their login), and sent to Supabase too ("Require current password
// when updating"). Passwords are never kept in the answer.
// Google-only accounts have no password: the page shows Forgot password
// instead (it sets a first password by email).
export async function changePassword(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const current = readPassword(formData, "current_password");
  const next = readPassword(formData, "new_password");
  const again = readPassword(formData, "confirm_password");

  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current_password = "Please enter your current password.";
  if (next.length < MIN_PASSWORD) fieldErrors.new_password = `Please use at least ${MIN_PASSWORD} characters.`;
  if (again !== next) fieldErrors.confirm_password = "The two new passwords don't match.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) return { error: LOGGED_OUT_ERROR };
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  const check = await checkCurrentPassword(user.email, current);
  if (check === "wrong") return { fieldErrors: { current_password: "Your current password isn't right." } };
  if (check === "error") return { error: "We couldn't check your password right now. Please try again in a few minutes." };

  const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
  if (error) return { error: friendlyAuthError(error) };
  return { success: "Your password has been changed." };
}

// ---------------------------------------------------------------------------
// ACCOUNT MANAGEMENT: deactivate / delete (My Profile, Change 17)
// ---------------------------------------------------------------------------

// Deactivates the person's own account.
// Takes: the previous state, and the form: understand ("on" = the "I
// understand" tick after the warning).
// Gives back: an error (e.g. "cancel your upcoming class first"), or (when it
// works) sends them to /auth/deactivated, which logs them out everywhere with
// a message. Version 1.4: logging in again offers to reactivate it.
export async function deactivateAccount(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  if (formData.get("understand") !== "on") {
    return { fieldErrors: { understand: "Please tick this to confirm." } };
  }
  const supabase = await createClient();
  if (!(await loggedInUserId(supabase))) return { error: LOGGED_OUT_ERROR };
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  // The database function (migrations 3 and 17) is the only way a client can
  // set their own account inactive (a direct change is blocked by a trigger).
  // It refuses while something is still going on, the same as Delete.
  const { error } = await supabase.rpc("deactivate_my_account");
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  redirect("/auth/deactivated");
}

// Turns the person's own account back on ("Welcome back!" page, Version 1.4).
// Takes: the previous state, and the form: next (the page they were going
// to, checked by safeNextPath()).
// Gives back: an error, or (when it works) sends them on to "next" (or Home).
// reactivate_my_account() (migration 17) only works for the caller's own
// account, and only if they deactivated it themselves (not the cafe).
export async function reactivateAccount(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  if (!(await loggedInUserId(supabase))) return { error: LOGGED_OUT_ERROR };

  const { error } = await supabase.rpc("reactivate_my_account");
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  redirect(next ?? "/");
}

// Deletes the person's own account (the approach you approved).
// Takes: the previous state, and the form: confirm_text (must be "DELETE")
// and password (only for accounts that have a password).
// Gives back: an error (including what to do first, e.g. "cancel your
// upcoming class"), or (when it works) logs them out and sends them to
// /login with a "your account was deleted" message.
// Steps:
//   1. the checks: "DELETE" typed, the current password right (if any)
//   2. close_my_account() (migration 16): refuses if anything is still going
//      on, otherwise blanks the profile, deactivates it, turns off their
//      codes and deletes their notifications; tells us if they ever booked
//   3. the LOGIN is removed with the secret key: a "soft delete" if they have
//      bookings (the row stays, so their bookings and payments stay with the
//      cafe; nobody can log in), a full delete if they never booked
//   4. log out on this device, go to /login
export async function deleteAccount(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const confirmText = readText(formData, "confirm_text");
  const password = readPassword(formData, "password");

  if (confirmText !== "DELETE") {
    return { fieldErrors: { confirm_text: 'Please type DELETE (in capital letters) to confirm.' } };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: LOGGED_OUT_ERROR };
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  // --- 1. Their password, if the account has one (Google-only accounts don't)
  if (hasPasswordLogin(user)) {
    if (!password) return { fieldErrors: { password: "Please enter your password." } };
    const check = await checkCurrentPassword(user.email ?? "", password);
    if (check === "wrong") return { fieldErrors: { password: "That password isn't right." } };
    if (check === "error") return { error: "We couldn't check your password right now. Please try again in a few minutes." };
  }

  // The secret key is needed for step 3: check it's set up BEFORE changing anything
  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return { error: "Deleting accounts isn't set up yet. Please message the cafe with Chat With Us." };
  }

  // --- 2. Close the account in the database (it says what to do first, if anything)
  const { data, error } = await supabase.rpc("close_my_account");
  if (error) {
    return { error: friendlyDatabaseError(error) };
  }
  const hasBookings = data[0]?.has_bookings !== false;

  // --- 3. Remove the login. true = "soft delete" (keeps the row for the bookings)
  const { error: deleteError } = await service.auth.admin.deleteUser(user.id, hasBookings);
  if (deleteError) {
    // The profile is already closed and deactivated, so they can't book any
    // more; the cafe can finish removing the login by hand
    console.error("Login was not removed after closing the account:", deleteError.code ?? deleteError.status);
  }

  // --- 4. Log out on this device
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?error=account-deleted");
}

// ---------------------------------------------------------------------------
// FINISH YOUR PROFILE (the /account/finish-profile page, Change 17)
// ---------------------------------------------------------------------------

// Fills in the details a client is missing (new Google accounts, and accounts
// made before the sign-up form asked for them).
// Takes: the previous state, and the form: full_name, mobile, birthday
// (MM/DD/YYYY), only for the ones the page asked for, and next (the page they
// were going to, checked by safeNextPath()).
// Gives back: field errors or a general error, or (when it works) sends them
// on to "next" (or My Profile).
// It looks at the SAVED profile first and only fills in what is still empty,
// so it can't be used to change a detail (My Profile does that).
export async function finishProfile(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const fullName = readText(formData, "full_name").replace(/\s+/g, " ");
  const mobile = readText(formData, "mobile");
  const birthdayText = readText(formData, "birthday");
  const next = safeNextPath(formData.get("next"));
  const values = { full_name: fullName, mobile, birthday: birthdayText };

  const supabase = await createClient();
  const userId = await loggedInUserId(supabase);
  if (!userId) return { error: LOGGED_OUT_ERROR, values };
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR, values };

  // What is missing right now? (Row Level Security: their own row only)
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("full_name, mobile, birthday")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !profile) {
    console.error("Could not read the profile:", readError?.code);
    return { error: GENERIC_ERROR, values };
  }

  // Check only the missing ones, with the sign-up rules (src/lib/validation.ts)
  const fieldErrors: Record<string, string> = {};
  const change: { full_name?: string; mobile?: string; birthday?: string } = {};
  if (!profile.full_name.trim()) {
    if (!fullName) fieldErrors.full_name = "Please enter your full name.";
    else if (fullName.length > 120) fieldErrors.full_name = "Please use 120 characters or fewer.";
    else change.full_name = fullName;
  }
  if (!profile.mobile?.trim()) {
    if (!isValidPhMobile(mobile)) fieldErrors.mobile = PH_MOBILE_ERROR;
    else change.mobile = normalizePhMobile(mobile);
  }
  if (!profile.birthday) {
    const birthday = parseBirthdayInput(birthdayText);
    if (!birthday) fieldErrors.birthday = BIRTHDAY_ERROR;
    else change.birthday = birthday;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  if (Object.keys(change).length > 0) {
    // The database triggers check the birthday again (a real past date)
    const { error } = await supabase.from("profiles").update(change).eq("id", userId);
    if (error) {
      // The trigger's own messages are plain English
      return { error: friendlyDatabaseError(error), values };
    }
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

// Reads a password field exactly as typed (spaces count in passwords).
// Takes: the form data and the field name.
// Gives back: the password, or "" if it's missing.
function readPassword(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
