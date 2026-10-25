// Small helpers for SHOWING the booking rules in the page.
// Where it's used: the session cards (Home), the booking pages (step 1,
// step 2, the pay page and the "You're booked" page), and the My Account
// pages (booking, payment and voucher badges, cancel explanations), and the
// admin pages (admin booking badges, seats-taken badges).
//
// These only decide how things look. The real rules (seat check, cutoff,
// holds, prices, cancellations) live in the database functions, so nobody can
// skip them by changing the page.

import type { BadgeVariant } from "@/components/ui/Badge";
import { formatManilaDateTime, formatPeso } from "@/lib/format";
import type {
  BookingStatus,
  ChangeRule,
  PaymentMethod,
  PaymentStatus,
  SessionStatus,
  VoucherState,
} from "@/types/app";
import type { Database } from "@/types/database";

// Who handled a payment: paymongo, manual (GCash / BPI transfer) or cash.
type PaymentProvider = Database["public"]["Enums"]["payment_provider"];

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
  // Booking closed = beige, fully booked = red (Change 17 colors)
  if (state === "booking_closed") return { label: "Booking closed", variant: "neutral" };
  if (seatsLeft <= 0 || state === "full") return { label: "Fully booked", variant: "error" };
  const label = capacity ? `${seatsLeft} of ${capacity} left` : `${seatsLeft} left`;
  // Only one seat left: warn with the yellow "few seats" color
  if (seatsLeft === 1) return { label, variant: "warning" };
  // Free seats: the Light Sage "available" badge
  return { label, variant: "available" };
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

// Picks the status badge for one booking, in plain words.
// Takes: the booking's status.
// Gives back: the badge text and color (CLAUDE.md section 7 status colors).
export function bookingStatusBadge(status: BookingStatus): { label: string; variant: BadgeVariant } {
  const badges: Record<BookingStatus, { label: string; variant: BadgeVariant }> = {
    pending_payment: { label: "Waiting for payment", variant: "warning" },
    awaiting_verification: { label: "Checking your payment", variant: "info" },
    confirmed: { label: "Confirmed", variant: "success" },
    paid_needs_action: { label: "Paid late, pick a class", variant: "warning" },
    expired: { label: "Expired", variant: "error" },
    transferred: { label: "Transferred", variant: "neutral" },
    cancelled_with_voucher: { label: "Cancelled with voucher", variant: "neutral" },
    forfeited: { label: "Forfeited", variant: "error" },
    no_show: { label: "No-show", variant: "error" },
    attended: { label: "Attended", variant: "success" },
  };
  return badges[status];
}

// ---------------------------------------------------------------------------
// My Account: cancel and transfer explanations
// ---------------------------------------------------------------------------

// Says how long until something happens, in rough, friendly words.
// Takes: milliseconds from now (e.g. class start minus "now").
// Gives back: e.g. "in 45 minutes", "in 18 hours", "in 3 days".
// (Rounded DOWN, so "in 23 hours" never shows for a class 23h59m away,
// which would look like it's already inside the 24-hour rule.)
export function describeTimeLeft(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${Math.max(minutes, 1)} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.floor(hours / 24)} days`;
}

// Works out the two time phrases the Cancel box needs for one class.
// Takes: the class date and start time, and "now" in milliseconds (default:
// the clock right now; pages call it after requireUser(), during a real visit).
// Gives back: { timeLeft: "in 18 hours", cancelOpensAt: "Fri, Oct 24, 9:00 AM" }
// (cancelOpensAt = 24 hours before class, when cancelling starts to be allowed).
export function cancelTiming(
  date: string,
  startTime: string,
  nowMs: number = Date.now(),
): { timeLeft: string; cancelOpensAt: string } {
  const startsAt = classStartsAt(date, startTime).getTime();
  return {
    timeLeft: describeTimeLeft(startsAt - nowMs),
    cancelOpensAt: formatManilaDateTime(new Date(startsAt - 24 * 3_600_000)),
  };
}

// What the Cancel button explains for one booking right now.
export type CancelExplanation = {
  title: string; // the box's heading
  body: string; // exactly what the policy means for THIS booking now
  // The confirm button's text, or null when cancelling isn't possible right
  // now (then the box only explains, and offers Transfer if allowed)
  confirmLabel: string | null;
  offerTransfer: boolean; // show a "Transfer instead" link?
};

// Explains the cancellation rules for one booking, in plain English.
// Takes: the rule from the database (change_rule), how far away the class is
// ("in 18 hours", from describeTimeLeft), and for "already_transferred" when
// cancelling opens (24 hours before class, e.g. "Fri, Oct 24, 9:00 AM").
// Gives back: the title, the explanation and the button to show.
// The DATABASE decides what really happens (cancel_my_booking uses the same
// rule); this only puts it into words first, so nobody is surprised.
export function cancelExplanation(rule: ChangeRule, timeLeft: string, cancelOpensAt = ""): CancelExplanation {
  switch (rule) {
    case "transfer":
      return {
        title: "Transfer instead",
        body: `Your class is ${timeLeft}, more than 24 hours away, so it can't be cancelled yet. You can move it to another open class for free instead (one time only). From 24 hours before class, cancelling gives you a 50% voucher.`,
        confirmLabel: null,
        offerTransfer: true,
      };
    case "already_transferred":
      return {
        title: "Not yet",
        body: `This booking was already transferred once, so it can't be moved again. Your class is ${timeLeft}. You can cancel it from 24 hours before class${cancelOpensAt ? ` (${cancelOpensAt})` : ""} and get a 50% voucher.`,
        confirmLabel: null,
        offerTransfer: false,
      };
    case "voucher":
      return {
        title: "Cancel and get a 50% voucher?",
        body: `Your class is ${timeLeft}. If you cancel now, you'll get a personal 50% voucher for the class fee, valid for 60 days and good for one booking. There are no cash refunds.`,
        confirmLabel: "Cancel and get my voucher",
        offerTransfer: false,
      };
    case "no_credit":
      return {
        title: "Cancel with no credit?",
        body: `Your class is ${timeLeft}, less than 12 hours away. If you cancel now, you won't get a voucher or a refund.`,
        confirmLabel: "Cancel with no credit",
        offerTransfer: false,
      };
    case "free_transfer":
      return {
        title: "The cafe cancelled this class",
        body: "You don't need to cancel. Move to any open class for free, even if it's less than 24 hours away.",
        confirmLabel: null,
        offerTransfer: true,
      };
    case "started":
      return {
        title: "This class has started",
        body: "A class that has already started can't be cancelled or moved.",
        confirmLabel: null,
        offerTransfer: false,
      };
  }
}

// ---------------------------------------------------------------------------
// My Account: payments and vouchers
// ---------------------------------------------------------------------------

// The short name of how a payment was made, for tables and receipts.
// Takes: the method (may be empty while a checkout is still open) and the
// provider (a manual GCash transfer says "GCash transfer").
// Gives back: e.g. "GCash", "Card", "BPI transfer", or "Not chosen yet".
export function paymentMethodName(method: PaymentMethod | null, provider: PaymentProvider): string {
  if (!method) return "Not chosen yet";
  if (method === "gcash" && provider === "manual") return "GCash transfer";
  const names: Record<PaymentMethod, string> = {
    gcash: "GCash",
    maya: "Maya",
    card: "Card",
    bpi: "BPI transfer",
    cash: "Cash",
  };
  return names[method];
}

// Picks the status badge for one payment.
// Takes: the payment's status and provider.
// Gives back: the badge text and color.
export function paymentStatusBadge(
  status: PaymentStatus,
  provider: PaymentProvider,
): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "paid":
      return { label: "Paid", variant: "success" };
    case "pending":
      // A manual transfer waits for the cafe to check the screenshot
      return provider === "manual"
        ? { label: "Checking your payment", variant: "info" }
        : { label: "Not finished", variant: "warning" };
    case "failed":
      return { label: "Failed, not charged", variant: "error" };
    case "expired":
      return { label: "Expired, not charged", variant: "error" };
    case "rejected":
      return { label: "Rejected", variant: "error" };
    case "refunded":
      return { label: "Refunded", variant: "neutral" };
  }
}

// Picks the status badge for one voucher.
// Takes: the voucher's state from get_my_vouchers().
// Gives back: the badge text and color.
export function voucherStateBadge(state: VoucherState): { label: string; variant: BadgeVariant } {
  const badges: Record<VoucherState, { label: string; variant: BadgeVariant }> = {
    active: { label: "Active", variant: "success" },
    reserved: { label: "On an unpaid booking", variant: "warning" },
    used: { label: "Used", variant: "neutral" },
    expired: { label: "Expired", variant: "error" },
  };
  return badges[state];
}

// Works out how many pesos a voucher takes off a class fee (the same sum as
// voucher_discount() in the database, which decides the real price).
// Takes: the class fee, and the voucher's percent off or pesos off.
// Gives back: the discount, never more than the class fee.
export function voucherDiscount(classFee: number, percentOff: number | null, amountOff: number | null): number {
  if (percentOff !== null) return Math.round(classFee * percentOff) / 100;
  if (amountOff !== null) return Math.min(amountOff, classFee);
  return 0;
}

// Makes a short receipt number for a payment.
// Takes: the payment's id.
// Gives back: e.g. "R69-7C1D2E3F" (the first 8 characters of the id).
export function receiptNumber(paymentId: string): string {
  return `R69-${paymentId.slice(0, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Admin pages
// ---------------------------------------------------------------------------

// Picks the status badge for one booking on the ADMIN pages. The words are
// the admin's (e.g. "Awaiting verification"), not the client's ("Checking
// your payment").
// Takes: the booking's status, and for an unpaid hold the seconds left.
// Gives back: the badge text and color, e.g. "Pending payment · 9 min".
export function adminBookingStatusBadge(
  status: BookingStatus,
  holdSecondsLeft = 0,
): { label: string; variant: BadgeVariant } {
  const badges: Record<BookingStatus, { label: string; variant: BadgeVariant }> = {
    pending_payment: {
      // Round UP, so "0 min" never shows while a few seconds are left
      label: holdSecondsLeft > 0 ? `Pending payment · ${Math.ceil(holdSecondsLeft / 60)} min` : "Pending payment",
      variant: "warning",
    },
    awaiting_verification: { label: "Awaiting verification", variant: "info" },
    confirmed: { label: "Confirmed", variant: "success" },
    paid_needs_action: { label: "Paid, needs action", variant: "error" },
    expired: { label: "Expired", variant: "error" },
    transferred: { label: "Transferred", variant: "neutral" },
    cancelled_with_voucher: { label: "Cancelled with voucher", variant: "neutral" },
    forfeited: { label: "Forfeited", variant: "error" },
    no_show: { label: "No-show", variant: "error" },
    attended: { label: "Attended", variant: "success" },
  };
  return badges[status];
}

// Picks the "seats taken" badge for a class on the admin pages.
// Takes: seats taken, the capacity and the class status.
// Gives back: e.g. { label: "3/4", variant: "success" }, "Full 4/4" (red, as
// in docs/designs/PhoneAdminDashboard.html), "Cancelled" or "Closed · 2/4".
export function adminSeatsBadge(
  taken: number,
  capacity: number,
  status: SessionStatus,
): { label: string; variant: BadgeVariant } {
  if (status === "cancelled") return { label: "Cancelled", variant: "error" };
  if (status === "closed") return { label: `Closed · ${taken}/${capacity}`, variant: "neutral" };
  if (taken >= capacity) return { label: `Full ${taken}/${capacity}`, variant: "error" };
  if (capacity - taken === 1) return { label: `${taken}/${capacity}`, variant: "warning" };
  return { label: `${taken}/${capacity}`, variant: "success" };
}
