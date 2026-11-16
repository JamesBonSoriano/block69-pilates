// Version 1.7 Prompt C: plain-English reasons when CHANGING THE EMAIL fails
// (My Profile > Account Information > Change email).
// Before, anything unusual showed "Something went wrong on our side", so
// nobody could tell what really happened. Now each Supabase error gets its
// own reason, and the full error is written to the server console.
// Where it's used: startEmailChange() and confirmEmailChange() in
// src/lib/account/actions.ts. Kept in its own file (no "@/" imports) so the
// unit test (tests/unit/email-change-errors.test.mjs) can load it.

// The parts of a Supabase Auth error we look at. (AuthError has these;
// written out here so this file needs no imports.)
export type EmailChangeError = {
  code?: string; // e.g. "over_email_send_rate_limit" (may be missing)
  status?: number; // the HTTP status, e.g. 429 or 500 (0 = no answer)
  name?: string; // e.g. "AuthApiError" or "AuthRetryableFetchError"
  message: string; // Supabase's own English text
};

// The reasons people see (exported so the tests can compare them).
export const EMAIL_CHANGE_MESSAGES = {
  taken: "Another account already uses that email.",
  tooMany: "Too many tries. Please wait a minute and try again.",
  notSent:
    "The code email could not be sent. Please try again in a few minutes. If it keeps happening, message the cafe with Chat With Us.",
  badAddress: "We can't send a code to that email address. Please check it, or use a different one.",
  loginAgain: "For your safety, please log out, log back in, and then change your email.",
  loggedOut: "Your login has ended. Please log in again, then change your email.",
  offline: "We couldn't reach the login server. Please check your internet and try again.",
  badCode: "That code is wrong or has expired. Please check it, or send a new code.",
} as const;

// Works out the reason to show when sending the code, or checking it, fails.
// Takes: the error Supabase gave back.
// Gives back: one plain-English sentence. Never a generic "something went
// wrong": an unknown error shows Supabase's own words, so the real reason
// is always visible.
export function emailChangeErrorMessage(error: EmailChangeError): string {
  switch (error.code) {
    // Another account already has that email
    case "email_exists":
    case "user_already_exists":
    case "conflict":
      return EMAIL_CHANGE_MESSAGES.taken;

    // Too many tries, or too many emails sent in a short time
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return EMAIL_CHANGE_MESSAGES.tooMany;

    // Supabase didn't accept the address (or its email service may only
    // send to some addresses)
    case "email_address_invalid":
    case "email_address_not_authorized":
    case "validation_failed":
      return EMAIL_CHANGE_MESSAGES.badAddress;

    // "Secure email change" wants a recent login
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return EMAIL_CHANGE_MESSAGES.loginAgain;

    // The login ran out while the page was open
    case "session_not_found":
    case "session_expired":
    case "no_authorization":
    case "bad_jwt":
      return EMAIL_CHANGE_MESSAGES.loggedOut;

    // A 6-digit code that is wrong, already used, or too old
    case "otp_expired":
    case "otp_disabled":
      return EMAIL_CHANGE_MESSAGES.badCode;
  }

  // Some rate limits come without a code, only the "429" status
  if (error.status === 429) return EMAIL_CHANGE_MESSAGES.tooMany;
  // No answer at all from Supabase (no internet, or Supabase is down)
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return EMAIL_CHANGE_MESSAGES.offline;
  // Supabase couldn't send the email (e.g. "Error sending email change
  // email": the email service or its SMTP settings refused it)
  if (/sending|smtp|email.*send/i.test(error.message) || error.status === 500) return EMAIL_CHANGE_MESSAGES.notSent;

  // Anything else: Supabase's own words, so the real reason is visible
  const text = error.message.trim();
  return text ? `The email couldn't be changed: ${text.replace(/\.?$/, ".")}` : EMAIL_CHANGE_MESSAGES.notSent;
}

// Writes the FULL error to the server console (never shown on the page), so
// the real cause can be found in the terminal running `npm run dev` (or the
// Vercel logs).
// Takes: which step failed ("send code" or "check code") and the error.
// Gives back: nothing.
export function logEmailChangeError(step: "send code" | "check code", error: EmailChangeError): void {
  console.error(`Change email (${step}) failed:`, {
    code: error.code ?? null,
    status: error.status ?? null,
    name: error.name ?? null,
    message: error.message,
  });
}
