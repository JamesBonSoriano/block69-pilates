// The words of the emails the website sends (plain text).
// Where it's used: src/lib/admin/user-actions.ts (admin messages and resent
// confirmations), src/lib/account/actions.ts (the "your email was
// changed" alert) and src/lib/admin/actions.ts (Version 1.6: "your class was
// re-scheduled"). The unit tests (tests/unit/email-text.test.mjs) load this
// file directly with Node, so it must not import anything.

// The cafe details every email ends with.
export type EmailCafe = {
  name: string; // e.g. "Block 69 Cafe"
  address: string; // e.g. "444 Kamagong St., Comembo, Taguig City"
  email: string; // e.g. "block69cafe@gmail.com"
};

// An email ready to send.
export type EmailText = { subject: string; text: string };

// The lines at the bottom of every email.
// Takes: the cafe details. Gives back: the sign-off text.
export function emailSignOff(cafe: EmailCafe): string {
  return ["", "--", cafe.name, cafe.address, cafe.email]
    .filter((line, n) => n < 2 || line.trim() !== "")
    .join("\n");
}

// A message the admin typed on the Communications page.
// Takes: the subject and message as typed, and the cafe details.
// Gives back: the subject (trimmed) and the message with the sign-off.
export function adminMessageEmail(
  subject: string,
  message: string,
  cafe: EmailCafe,
): EmailText {
  return {
    subject: subject.trim(),
    text: `${message.trim()}\n${emailSignOff(cafe)}`,
  };
}

// What a booking confirmation needs (already turned into words).
export type ConfirmationDetails = {
  name: string | null; // the client's name (null = "Hi,")
  reference: string; // e.g. "B69-3F9A1C2D"
  classDate: string; // e.g. "Thursday, October 29"
  classTime: string; // e.g. "9:00 – 9:50 AM"
  drink: string | null; // the drink they picked (null = choose at the cafe)
  matRental: boolean;
  total: string; // e.g. "₱550"
};

// The "You're booked" email, sent again by the admin.
// Takes: the booking details and the cafe details.
// Gives back: the subject and text.
export function confirmationEmail(
  details: ConfirmationDetails,
  cafe: EmailCafe,
): EmailText {
  const lines = [
    details.name ? `Hi ${details.name},` : "Hi,",
    "",
    `You're booked for Mindful Mat Pilates at ${cafe.name}. Here are your booking details:`,
    "",
    `Booking: ${details.reference}`,
    `Date: ${details.classDate}`,
    `Time: ${details.classTime}`,
    `Drink: ${details.drink ?? "Choose at the cafe"}`,
    `Mat rental: ${details.matRental ? "Yes" : "No (bring your own mat)"}`,
    `Total: ${details.total}`,
    "",
    "Please arrive 5 to 10 minutes early. Bring a water bottle, a towel and comfortable workout clothes.",
    "You can see, cancel or move this booking in My Account > My Bookings.",
  ];
  return {
    subject: `Your Mat Pilates booking at ${cafe.name}: ${details.classDate}`,
    text: `${lines.join("\n")}\n${emailSignOff(cafe)}`,
  };
}

// What the "your class was re-scheduled" email needs (Version 1.6, already
// turned into words).
export type RescheduleDetails = {
  name: string | null; // the client's name (null = "Hi,")
  reference: string; // the NEW booking's code, e.g. "B69-3F9A1C2D"
  fromClass: string; // e.g. "Thursday, November 19 · 9:00 – 9:50 AM"
  toClass: string; // e.g. "Saturday, November 21 · 10:15 – 11:05 AM"
  reason: string; // the admin's reason, as typed
};

// The email sent when the cafe moves a client's booking to another class.
// Takes: the details above and the cafe details.
// Gives back: the subject and text.
export function rescheduleEmail(
  details: RescheduleDetails,
  cafe: EmailCafe,
): EmailText {
  const lines = [
    details.name ? `Hi ${details.name},` : "Hi,",
    "",
    `${cafe.name} re-scheduled your Mindful Mat Pilates booking to another class.`,
    "",
    `From: ${details.fromClass}`,
    `To: ${details.toClass}`,
    `Booking: ${details.reference}`,
    `Reason: ${details.reason.trim()}`,
    "",
    "Your payment, drink and mat rental carry over to the new class. There is nothing more to pay.",
    "You can see this booking in My Account > My Bookings. If the new time doesn't work for you, please reply to this email.",
  ];
  return {
    subject: `Your Mat Pilates class was re-scheduled: ${details.toClass}`,
    text: `${lines.join("\n")}\n${emailSignOff(cafe)}`,
  };
}

// What the "the cafe cancelled your booking" email needs (Version 1.7,
// already turned into words).
export type CafeCancelDetails = {
  name: string | null; // the client's name (null = "Hi,")
  reference: string; // the booking's code, e.g. "B69-3F9A1C2D"
  classLabel: string; // e.g. "Thursday, November 19 · 9:00 – 9:50 AM"
  outcome: "free_code" | "half_code" | "no_credit" | "refunded"; // what the cafe gave
  code: string | null; // the 100% or 50% code (null = none)
  codeExpires: string | null; // the code's last day, e.g. "January 15, 2027"
};

// The email sent when an admin cancels one client's booking (Version 1.7).
// Takes: the details above and the cafe details.
// Gives back: the subject and text. The admin's reason is NOT in it (the
// reason is saved for admins only).
export function cafeCancelEmail(
  details: CafeCancelDetails,
  cafe: EmailCafe,
): EmailText {
  // The one sentence about what the client gets
  const until = details.codeExpires ? `, until ${details.codeExpires}` : "";
  const outcomeLine: Record<CafeCancelDetails["outcome"], string> = {
    free_code: `Your code ${details.code ?? ""} gives you one class for free (the class fee). Use it when you book any open class${until}. It's also in My Account > My Vouchers.`,
    half_code: `Your code ${details.code ?? ""} gives you 50% off the class fee of your next booking${until}. It's also in My Account > My Vouchers.`,
    no_credit:
      "As the class was less than 12 hours away, this cancellation comes with no credit.",
    refunded:
      "The cafe has refunded your payment to you directly (outside the website).",
  };
  const lines = [
    details.name ? `Hi ${details.name},` : "Hi,",
    "",
    `${cafe.name} had to cancel your Mindful Mat Pilates booking.`,
    "",
    `Class: ${details.classLabel}`,
    `Booking: ${details.reference}`,
    "",
    outcomeLine[details.outcome],
    "We're sorry for the trouble. If you have any questions, please reply to this email.",
  ];
  return {
    subject: `Your Mat Pilates booking was cancelled: ${details.classLabel}`,
    text: `${lines.join("\n")}\n${emailSignOff(cafe)}`,
  };
}

// The security alert sent to the OLD address after a client changes their
// login email (My Profile > Change email).
// Takes: the client's name (or null), the new email and the cafe details.
// Gives back: the subject and text.
export function emailChangedAlert(
  name: string | null,
  newEmail: string,
  cafe: EmailCafe,
): EmailText {
  const lines = [
    name ? `Hi ${name},` : "Hi,",
    "",
    `The email address of your ${cafe.name} account was changed to ${newEmail}.`,
    "From now on, log in with the new email.",
    "",
    `If you didn't do this, please contact us right away at ${cafe.email}.`,
  ];
  return {
    subject: `Your ${cafe.name} email was changed`,
    text: `${lines.join("\n")}\n${emailSignOff(cafe)}`,
  };
}

// Explains what happens to the booking and payment after a whole-class cancellation.
export function wholeClassCancelledEmail(
  classLabel: string,
  kind: "class_cancelled" | "class_cancelled_checking" | "class_cancelled_hold_released",
  cafe: EmailCafe,
): EmailText {
  const next = {
    class_cancelled: "See My Account > My Bookings for your free re-schedule and its deadline.",
    class_cancelled_checking: "Your transfer is still being checked. Contact the cafe if you already sent money and need help.",
    class_cancelled_hold_released: "Your unpaid seat hold was released. Check My Bookings or contact the cafe if you already paid.",
  };
  return {
    subject: "Your Mat Pilates class was cancelled",
    text: `The cafe cancelled the Mat Pilates class on ${classLabel}.\n\n${next[kind]}\n${emailSignOff(cafe)}`,
  };
}
