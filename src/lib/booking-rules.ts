// Small helpers for SHOWING the booking rules in the page.
// Where it's used: the session cards (Home), and the booking pages (step 1,
// step 2, the pay page and the "You're booked" page).
//
// These only decide how things look. The real rules (seat check, cutoff,
// holds, prices, cancellations) live in the database functions, so nobody can
// skip them by changing the page.

import type { BadgeVariant } from "@/components/ui/Badge";
import { formatPeso } from "@/lib/format";
import type { BookingStatus, PaymentMethod } from "@/types/app";

// Picks the seats-left badge for one class.
// Takes: the class's seats left and its state from get_open_sessions()
// ("open", "full", "booking_closed", "closed" or "cancelled"), and optionally
// its capacity (then the badge says "3 of 4 left", like booking step 1).
// Gives back: the badge text and color, e.g. { label: "1 left", variant: "warning" }.
export function seatBadge(
  seatsLeft: number,
  state: string,
  capacity?: number,
): { label: string; variant: BadgeVariant } {
  if (state === "cancelled") return { label: "Cancelled", variant: "error" };
  if (state === "closed") return { label: "Closed", variant: "neutral" };
  if (state === "booking_closed") return { label: "Booking closed", variant: "neutral" };
  if (seatsLeft <= 0 || state === "full") return { label: "Full", variant: "neutral" };
  const label = capacity ? `${seatsLeft} of ${capacity} left` : `${seatsLeft} left`;
  // Only one seat left: warn with the yellow "few seats" color
  if (seatsLeft === 1) return { label, variant: "warning" };
  return { label, variant: "success" };
}

// Explains in plain English why a class can't be booked right now.
// Takes: the state from get_open_sessions().
// Gives back: one sentence for booking step 2, or "" if the class is open.
export function sessionStateMessage(state: string): string {
  switch (state) {
    case "full":
      return "Sorry, this class is full. Please pick another class.";
    case "booking_closed":
      return "Online booking for this class has closed. Please pick another class, or message us with Chat With Us.";
    case "closed":
      return "The cafe has closed this class for booking. Please pick another class.";
    case "cancelled":
      return "The cafe cancelled this class. Please pick another class.";
    default:
      return "";
  }
}

// Describes a voucher's discount in a few words.
// Takes: the voucher's percent off or peso amount off (one of them is null).
// Gives back: e.g. "10% off the class fee" or "₱100 off the class fee".
// (Vouchers never discount the mat rental, so it always says "class fee".)
export function voucherLabel(percentOff: number | null, amountOff: number | null): string {
  if (percentOff !== null) return `${Number(percentOff)}% off the class fee`;
  if (amountOff !== null) return `${formatPeso(Number(amountOff))} off the class fee`;
  return "Discount on the class fee";
}

// Makes a short booking number people can read out at the counter.
// Takes: the booking's id, e.g. "3f9a1c2d-0b4e-...".
// Gives back: e.g. "B69-3F9A1C2D" (the first 8 characters of the id).
export function bookingReference(bookingId: string): string {
  return `B69-${bookingId.slice(0, 8).toUpperCase()}`;
}

// Works out the exact moment a class starts.
// Takes: the class date ("2026-10-23") and start time ("09:00:00"), both
// Philippine time, as they are saved in the database.
// Gives back: a Date for that moment. The Philippines is always UTC+8 (no
// daylight saving), so "+08:00" is always right.
export function classStartsAt(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime.slice(0, 8)}+08:00`);
}

// Less than this many hours before class, cancelling gives no credit
// (CLAUDE.md section 5). The database enforces it in cancel_my_booking();
// the booking page only uses it to show a warning first.
export const NO_CREDIT_HOURS = 12;

// Checks if a class is so close that cancelling would give no credit.
// Takes: the class date and start time, and "now" in milliseconds (default:
// the clock right now). Server pages call it while drawing a page for a real
// visit (after requireUser()), so reading the clock there is safe.
// Gives back: true if the class starts less than 12 hours from now.
export function isInNoCreditWindow(date: string, startTime: string, nowMs: number = Date.now()): boolean {
  const hoursLeft = (classStartsAt(date, startTime).getTime() - nowMs) / 3_600_000;
  return hoursLeft < NO_CREDIT_HOURS;
}

// Formats the seat-hold countdown.
// Takes: seconds left, e.g. 872.
// Gives back: "14:32" (minutes:seconds). Never below "0:00".
export function formatCountdown(secondsLeft: number): string {
  const total = Math.max(0, Math.ceil(secondsLeft));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The name of a payment method as people say it.
// Takes: the method saved on the payment (gcash, maya, card, bpi, cash).
// Gives back: e.g. "GCash" or "a credit or debit card".
export function paymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    gcash: "GCash",
    maya: "Maya",
    card: "a credit or debit card",
    bpi: "BPI transfer",
    cash: "cash",
  };
  return labels[method];
}

// Picks the status badge for one booking.
// Takes: the booking's status.
// Gives back: the badge text and color (CLAUDE.md section 7 status colors).
export function bookingStatusBadge(status: BookingStatus): { label: string; variant: BadgeVariant } {
  const badges: Record<BookingStatus, { label: string; variant: BadgeVariant }> = {
    pending_payment: { label: "Waiting for payment", variant: "warning" },
    awaiting_verification: { label: "Checking payment", variant: "info" },
    confirmed: { label: "Confirmed", variant: "success" },
    paid_needs_action: { label: "Paid, needs action", variant: "error" },
    expired: { label: "Expired", variant: "error" },
    transferred: { label: "Transferred", variant: "neutral" },
    cancelled_with_voucher: { label: "Cancelled (voucher given)", variant: "neutral" },
    forfeited: { label: "Forfeited", variant: "error" },
    no_show: { label: "No-show", variant: "error" },
    attended: { label: "Attended", variant: "success" },
  };
  return badges[status];
}
