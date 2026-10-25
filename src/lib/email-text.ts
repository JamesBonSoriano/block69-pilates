// The words of the emails the website sends (plain text).
// Where it's used: src/lib/admin/user-actions.ts (admin messages and resent
// confirmations) and src/lib/account/actions.ts (the "your email was
// changed" alert). The unit tests (tests/unit/email-text.test.mjs) load this
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
  return ["", "--", cafe.name, cafe.address, cafe.email].filter((line, n) => n < 2 || line.trim() !== "").join("\n");
}

// A message the admin typed on the Communications page.
// Takes: the subject and message as typed, and the cafe details.
// Gives back: the subject (trimmed) and the message with the sign-off.
export function adminMessageEmail(subject: string, message: string, cafe: EmailCafe): EmailText {
  return { subject: subject.trim(), text: `${message.trim()}\n${emailSignOff(cafe)}` };
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
export function confirmationEmail(details: ConfirmationDetails, cafe: EmailCafe): EmailText {
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

// The security alert sent to the OLD address after a client changes their
// login email (My Profile > Change email).
// Takes: the client's name (or null), the new email and the cafe details.
// Gives back: the subject and text.
export function emailChangedAlert(name: string | null, newEmail: string, cafe: EmailCafe): EmailText {
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
