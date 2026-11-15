// Sends an email to a client AND keeps it in their Communications history
// (Users > a client > Communications).
// Where it's used: src/lib/admin/user-actions.ts (admin messages, resent
// confirmations) and, since Version 1.6, src/lib/admin/actions.ts (the
// "your class was re-scheduled" email).
//
// It lives in its own file, not in a "use server" file, because every
// function exported from a "use server" file can be called from the browser.
// These helpers must only ever run inside our own admin actions, after they
// have checked that the caller is an admin.
//
// Sending an email has three steps, so the history is always right:
//   1. admin_start_message() checks it and logs it as 'sending' (the
//      database gives back the client's email address, so a changed form
//      can't send to someone else),
//   2. sendEmail() sends it with Gmail (src/lib/email.ts, never throws),
//   3. admin_finish_message() marks it 'sent' or 'failed'.

import "server-only"; // never sent to the browser
import { refresh } from "next/cache";
import type { ServerClient } from "@/lib/admin/action-helpers";
import type { AdminSaveState } from "@/lib/admin/form-state";
import { friendlyDatabaseError } from "@/lib/database-errors";
import { getPublicSettings } from "@/lib/data/settings";
import { EMAIL_NOT_SET_UP, emailIsSetUp, sendEmail } from "@/lib/email";
import type { EmailCafe, EmailText } from "@/lib/email-text";

// Shown when the cafe's settings couldn't be loaded for the sign-off.
export const CAFE_DETAILS_ERROR = "We couldn't load the cafe details for the email. Please try again in a moment.";

// Loads the cafe details every email ends with (from Settings).
// Takes: nothing. Gives back: the details, or null if they couldn't load.
export async function cafeDetails(): Promise<EmailCafe | null> {
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
export async function sendLogged(
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
  return { saved: `${what} sent to ${started.to_email}.`, savedAt: Date.now() };
}
