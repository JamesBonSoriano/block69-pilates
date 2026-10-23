// Turns a notification row (a "kind" from the database) into the words the
// client reads on My Account > Notifications.
// Where it's used: src/app/(client)/account/notifications/page.tsx.
// The database only saves WHAT happened (migration 12), so the wording can be
// changed here without touching the database.

import type { BadgeVariant } from "@/components/ui/Badge";
import { formatClassDate, formatTime } from "@/lib/format";
import type { MyNotification } from "@/lib/data/notifications";

// What one update looks like on the page.
export type NotificationText = {
  title: string; // short heading, e.g. "Booking confirmed"
  body: string; // one or two plain sentences
  tone: BadgeVariant; // the color of its icon circle (status colors, CLAUDE.md section 7)
  href: string; // where "See details" goes
  linkLabel: string; // the words on that link
};

// Writes the class an update is about, e.g. "Sat, 24 Oct at 9:00 AM".
// Takes: the notification. Gives back: the text, or "your class" if the
// update has no class (should not happen, but never show "null").
function classLabel(n: MyNotification): string {
  if (!n.class_date || !n.start_time) return "your class";
  return `${formatClassDate(n.class_date).short} at ${formatTime(n.start_time)}`;
}

// Makes the words for one update.
// Takes: the notification row.
// Gives back: its title, sentence, color and link.
export function notificationText(n: MyNotification): NotificationText {
  const when = classLabel(n);
  const bookings = { href: "/account/bookings", linkLabel: "See my bookings" };

  switch (n.kind) {
    case "booking_confirmed":
      return { title: "Booking confirmed", body: `You're booked for ${when}. See you at the cafe!`, tone: "success", ...bookings };
    case "payment_checking":
      return {
        title: "We're checking your payment",
        body: `We got your transfer screenshot for ${when}. Your seat is held while the cafe checks it.`,
        tone: "info",
        ...bookings,
      };
    case "payment_approved":
      return {
        title: "Payment approved",
        body: `The cafe checked your transfer. You're booked for ${when}.`,
        tone: "success",
        ...bookings,
      };
    case "payment_rejected":
      return {
        title: "Payment not approved",
        body: `The cafe couldn't match your transfer for ${when}, so the seat was let go. If you think this is a mistake, please message the cafe with Chat With Us.`,
        tone: "error",
        ...bookings,
      };
    case "payment_needs_action":
      return {
        title: "Payment received",
        body: `We received your payment for ${when}, but the class was full or closed by then. The cafe will contact you to sort it out.`,
        tone: "warning",
        ...bookings,
      };
    case "booking_transferred":
      return { title: "Booking moved", body: `Your booking was moved to ${when}.`, tone: "neutral", ...bookings };
    case "cancelled_with_voucher":
      return {
        title: "Booking cancelled, 50% code given",
        body: n.voucher_code
          ? `Your booking for ${when} was cancelled. Your 50% code ${n.voucher_code} is in My Vouchers.`
          : `Your booking for ${when} was cancelled. Your 50% code is in My Vouchers.`,
        tone: "neutral",
        href: "/account/vouchers",
        linkLabel: "See my vouchers",
      };
    case "booking_forfeited":
      return {
        title: "Booking cancelled",
        body: `Your booking for ${when} was cancelled with no credit.`,
        tone: "neutral",
        ...bookings,
      };
    case "class_cancelled":
      return {
        title: "Class cancelled by the cafe",
        body: `The cafe cancelled the class on ${when}. You can move to another class for free in My Bookings.`,
        tone: "error",
        ...bookings,
      };
  }
}
