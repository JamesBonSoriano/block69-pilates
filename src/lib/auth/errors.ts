// Turns Supabase login errors into short, plain-English messages, and holds
// the other messages the login pages share.
// Where it's used: src/lib/auth/actions.ts (log in, sign up, new password),
// src/lib/account/actions.ts (change password on My Profile) and the login page.
//
// Supabase gives each error a "code" (e.g. "invalid_credentials"). We match
// on the code, never on the English text, because the text can change.

import type { AuthError } from "@supabase/supabase-js";

// Shown when a deactivated account tries to log in or is logged out.
export const DEACTIVATED_MESSAGE =
  "This account has been deactivated, so you can't log in. If you think this is a mistake, message us with Chat With Us.";

// Shown on the forgot-password page whether or not the email has an account,
// so nobody can use the page to find out who is signed up.
export const RESET_EMAIL_SENT_MESSAGE =
  "If an account uses that email, we've sent it a link to reset your password. It can take a few minutes, so check your spam folder too.";

// The shortest password we accept (also shown as a hint on the forms).
export const MIN_PASSWORD_LENGTH = 8;

// Works out the message to show for a Supabase Auth error.
// Takes: the error Supabase gave back.
// Gives back: a friendly sentence for the person using the form.
export function friendlyAuthError(error: AuthError): string {
  switch (error.code) {
    // Wrong email or password (Supabase never says which one, on purpose)
    case "invalid_credentials":
      return "That email and password don't match. Please check them and try again.";

    // Signing up with an email that already has an account
    case "email_exists":
    case "user_already_exists":
      return "An account already uses this email. Log in instead, or use Forgot password.";

    // Password too short or too simple
    case "weak_password":
      return `That password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters, mixing letters and numbers.`;

    // Setting a "new" password that is the same as the old one
    case "same_password":
      return "That's already your password. Please choose a different one.";

    // Changing the password on My Profile with the wrong (or no) current
    // password. Supabase checks it ("Require current password when updating"
    // in the dashboard; see docs/PROGRESS.md).
    case "current_password_mismatch":
    case "current_password_required":
      return "Your current password isn't right. Please check it and try again.";

    // "Secure password change" is on and the login is over 24 hours old
    case "reauthentication_needed":
      return "For your safety, please log out, log back in, and then change your password.";

    // Signed up but hasn't clicked the link in the confirmation email yet
    case "email_not_confirmed":
      return "Please confirm your email first. Click the link in the email we sent you (check your spam folder too).";

    // Supabase didn't accept the email address
    case "email_address_invalid":
    case "email_address_not_authorized":
      return "We can't use that email address. Please check it, or try a different one.";

    // Too many attempts in a short time
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many tries. Please wait a few minutes and try again.";

    case "signup_disabled":
      return "New sign-ups are switched off right now. Please message us with Chat With Us.";

    // The reset link's login has run out
    case "session_not_found":
    case "session_expired":
      return "Your link has expired. Please ask for a new one.";
  }

  // Some rate-limit errors come without a code, only the "429" status
  if (error.status === 429) {
    return "Too many tries. Please wait a few minutes and try again.";
  }

  return "Something went wrong on our side. Please try again in a moment.";
}
