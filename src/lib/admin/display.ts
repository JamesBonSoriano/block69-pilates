// Small helpers for SHOWING things on the admin pages: what the barista has
// to prepare for a class, and (Version 1.6) the five simple appointment
// statuses with their filter chips.
// Where it's used: the admin Dashboard and Appointments pages and their
// components (src/components/admin/).
// Nothing here decides a rule: the database does that (migration 9 and the
// admin_* functions from migration 3).

import type { BadgeVariant } from "@/components/ui/Badge";
import type { AdminRosterItem, BookingStatus } from "@/types/app";

// Bookings that count as "coming to class" on the attendance list.
const COMING: BookingStatus[] = ["confirmed", "attended", "no_show"];

// Checks if a guest is (or was) coming to the class, so they get a drink,
// a mat and Attended / No-show buttons.
// Takes: one roster row.
// Gives back: true for confirmed, attended and no-show bookings. (Unpaid
// holds, payments being checked and late payments are shown separately.)
export function isComing(guest: AdminRosterItem): boolean {
  return COMING.includes(guest.status);
}

// What the barista has to prepare for one class.
export type PrepSummary = {
  guests: number; // people coming (confirmed, attended, no-show)
  drinks: { name: string; count: number }[]; // e.g. [{ "Iced Matcha", 2 }], most first
  undecidedDrinks: number; // guests who will pick their drink at the cafe
  mats: number; // mats to set out
};

// Counts the drinks and mats for one class (Dashboard class cards).
// Takes: the class's roster rows.
// Gives back: a PrepSummary, counting only the guests who are coming.
export function prepSummary(roster: AdminRosterItem[]): PrepSummary {
  const coming = roster.filter(isComing);
  const counts = new Map<string, number>();
  let undecided = 0;
  for (const guest of coming) {
    // "Decide at the cafe" (one of the drink options in settings) or no
    // choice at all = undecided
    if (guest.drink_choice && !/^decide/i.test(guest.drink_choice)) {
      counts.set(guest.drink_choice, (counts.get(guest.drink_choice) ?? 0) + 1);
    } else {
      undecided += 1;
    }
  }
  return {
    guests: coming.length,
    drinks: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    undecidedDrinks: undecided,
    mats: coming.filter((guest) => guest.mat_rental).length,
  };
}

// Writes a PrepSummary as one short line.
// Takes: the summary.
// Gives back: e.g. "2 Iced Matcha · 1 Hot Coffee · 3 mats", or "No guests yet".
export function prepLine(summary: PrepSummary): string {
  if (summary.guests === 0) return "No guests yet";
  const parts = summary.drinks.map((drink) => `${drink.count} ${drink.name}`);
  if (summary.undecidedDrinks > 0)
    parts.push(`${summary.undecidedDrinks} decide at cafe`);
  parts.push(`${summary.mats} mat${summary.mats === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

// What the Appointments list can filter on: a real booking status, or
// (Version 1.5) "pending_attendance" = still confirmed after the class ended
// (admin_search_bookings, migration 22, works that out; it isn't saved).
export type BookingFilterWord = BookingStatus | "pending_attendance";

// ---------------------------------------------------------------------------
// Version 1.6: five simple appointment statuses
// ---------------------------------------------------------------------------
// The admin sees only five words. The database statuses stay as they are;
// each one belongs to exactly one group:
//   Pending       pending_payment, awaiting_verification, paid_needs_action
//   Confirmed     confirmed
//   Done          attended
//   Cancelled     cancelled_with_voucher, forfeited, expired, no_show
//   Re-scheduled  transferred (Version 1.7: no chip any more; the old row of
//                 a re-schedule is never listed, but its details page still
//                 says "Re-scheduled" when opened from History)
// (There is no plain "cancelled" booking status: a class can be cancelled,
// a booking is cancelled WITH a code, forfeited, expired or a no-show.)
export type AppointmentGroup =
  "pending" | "confirmed" | "done" | "cancelled" | "rescheduled";

// Each group's word and badge colour.
export const APPOINTMENT_GROUPS: Record<
  AppointmentGroup,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Pending", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  done: { label: "Done", variant: "info" },
  cancelled: { label: "Cancelled", variant: "error" },
  rescheduled: { label: "Re-scheduled", variant: "neutral" },
};

// Which group each database status belongs to.
export const GROUP_OF_STATUS: Record<BookingStatus, AppointmentGroup> = {
  pending_payment: "pending",
  awaiting_verification: "pending",
  paid_needs_action: "pending",
  confirmed: "confirmed",
  attended: "done",
  cancelled_with_voucher: "cancelled",
  forfeited: "cancelled",
  expired: "cancelled",
  no_show: "cancelled",
  transferred: "rescheduled",
};

// The database statuses of one group.
// Takes: the group. Gives back: its statuses, in the order of GROUP_OF_STATUS.
function statusesOf(group: AppointmentGroup): BookingStatus[] {
  return (Object.keys(GROUP_OF_STATUS) as BookingStatus[]).filter(
    (status) => GROUP_OF_STATUS[status] === group,
  );
}

// The status filter chips on the admin Appointments page (Version 1.6: six;
// Version 1.7: five, the "Re-scheduled" chip was removed).
// key      what goes in the address (?status=...)
// label    the chip's text
// statuses what admin_search_bookings filters on (empty = every status,
//          the default "All"; Version 1.7: expired holds included too)
// The database uses its historical pending_attendance filter for completed confirmed bookings.
export const STATUS_CHIPS: {
  key: "all" | AppointmentGroup;
  label: string;
  statuses: BookingFilterWord[];
}[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "pending", label: "Pending", statuses: statusesOf("pending") },
  {
    key: "confirmed",
    label: "Confirmed",
    statuses: ["confirmed"],
  },
  { key: "done", label: "Done", statuses: [...statusesOf("done"), "pending_attendance"] },
  { key: "cancelled", label: "Cancelled", statuses: statusesOf("cancelled") },
];

// Version 1.7: what the cafe gave when an ADMIN cancelled one appointment
// (admin_cancel_appointment, migration 27), worked out from the admin log.
export type CafeCancelOutcome =
  "free_code" | "half_code" | "no_credit" | "refunded";

// Finds how the admin cancelled this booking, if they did.
// Takes: the booking id and its admin log rows (admin_booking_change_info).
// Gives back: the outcome of the newest admin cancel, or null (not
// cancelled by an admin).
export function cafeCancelOutcome(
  bookingId: string,
  actions: { action: string; booking_id: string; created_at: string }[],
): CafeCancelOutcome | null {
  const words: Record<string, CafeCancelOutcome> = {
    cancel_free_code: "free_code",
    cancel_voucher: "half_code",
    cancel_no_credit: "no_credit",
    cancel_refunded: "refunded",
  };
  // The newest cancel on THIS booking (not on the one it was moved from)
  const newest = actions
    .filter(
      (row) => row.booking_id === bookingId && Object.hasOwn(words, row.action),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return newest ? words[newest.action] : null;
}

// Extra facts that change the exact reason shown on the details page.
export type AppointmentFacts = {
  holdSecondsLeft?: number; // seconds left on an unpaid hold
  attendanceDue?: boolean; // confirmed and the class has ended
  sessionCancelled?: boolean; // the cafe cancelled the class
  manualPaymentExpired?: boolean; // manual approval closed at class end
  paymentRejected?: boolean; // a GCash / BPI screenshot was rejected
  cafeCancel?: CafeCancelOutcome | null; // Version 1.7: cancelled by an admin, and how
};

// One appointment's status for the admin: the simple group, and the exact
// reason (shown under it on the details page, e.g. "Cancelled · No-show").
// Takes: the status the admin should see (admin_search_bookings /
// admin_get_booking "shown_status": an ended unpaid hold is "expired") and
// the extra facts above.
// Gives back: { group, label, variant, reason } (reason null = nothing more
// to say, e.g. a plain confirmed booking).
export function appointmentStatus(
  status: BookingStatus,
  facts: AppointmentFacts = {},
): {
  group: AppointmentGroup;
  label: string;
  variant: BadgeVariant;
  reason: string | null;
} {
  // Completed confirmed appointments go in Done without changing stored attendance history.
  const group = status === "confirmed" && facts.attendanceDue ? "done" : GROUP_OF_STATUS[status];
  const { label, variant } = APPOINTMENT_GROUPS[group];
  const inCancelledClass = facts.sessionCancelled
    ? " · class cancelled by the cafe"
    : "";
  const seconds = facts.holdSecondsLeft ?? 0;
  const reasons: Record<BookingStatus, string | null> = {
    // Round the minutes UP, so "0 min" never shows while seconds are left
    pending_payment:
      seconds > 0
        ? `Waiting for payment (${Math.ceil(seconds / 60)} min left)`
        : "Waiting for payment",
    awaiting_verification: `Awaiting payment verification${inCancelledClass}`,
    paid_needs_action: `Paid, needs action${inCancelledClass}`,
    confirmed: facts.attendanceDue
      ? "Class ended"
      : facts.sessionCancelled
        ? "Class cancelled by the cafe (free re-schedule)"
        : null,
    attended: "Attended",
    // Version 1.7: an admin cancel says what the cafe gave
    cancelled_with_voucher:
      facts.cafeCancel === "free_code"
        ? "Cancelled by the cafe · 100% code given"
        : facts.cafeCancel === "half_code"
          ? "Cancelled by the cafe · 50% code given"
          : "50% code given",
    forfeited:
      facts.cafeCancel === "refunded"
        ? "Refunded outside the website"
        : facts.cafeCancel === "no_credit"
          ? "Cancelled by the cafe (no credit)"
          : "Forfeited (no credit)",
    expired: facts.manualPaymentExpired
      ? "Manual payment approval expired · check received funds"
      : facts.paymentRejected
      ? "Payment rejected"
      : facts.sessionCancelled
        ? "Class cancelled by the cafe (seat hold released, not charged)"
        : "Payment time ran out",
    no_show: "No-show",
    transferred: "Moved to another class",
  };
  return { group, label, variant, reason: reasons[status] };
}
