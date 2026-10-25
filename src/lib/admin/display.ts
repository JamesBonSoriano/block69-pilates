// Small helpers for SHOWING things on the admin pages: what the barista has
// to prepare for a class, and the status filter chips on Bookings.
// Where it's used: the admin Dashboard and Bookings pages and their
// components (src/components/admin/).
// Nothing here decides a rule: the database does that (migration 9 and the
// admin_* functions from migration 3).

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
  if (summary.undecidedDrinks > 0) parts.push(`${summary.undecidedDrinks} decide at cafe`);
  parts.push(`${summary.mats} mat${summary.mats === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

// The status chips on the admin Bookings page (docs/designs/AdminBookings.html).
// key      what goes in the address (?status=...)
// label    the chip's text
// statuses what admin_search_bookings filters on (empty = every status
//          except expired, the default "All")
// Version 1.4: no "Attended" / "No-show" chips. "Forfeited" also lists
// no-shows ("No-shows automatically forfeit their booking"); each row still
// shows its real status badge.
export const STATUS_CHIPS: { key: string; label: string; statuses: BookingStatus[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "needs_action", label: "Needs action", statuses: ["awaiting_verification", "paid_needs_action"] },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { key: "pending_payment", label: "Pending payment", statuses: ["pending_payment"] },
  { key: "awaiting_verification", label: "Awaiting verification", statuses: ["awaiting_verification"] },
  { key: "paid_needs_action", label: "Paid, needs action", statuses: ["paid_needs_action"] },
  { key: "transferred", label: "Transferred", statuses: ["transferred"] },
  { key: "cancelled_with_voucher", label: "Cancelled with voucher", statuses: ["cancelled_with_voucher"] },
  { key: "forfeited", label: "Forfeited", statuses: ["forfeited", "no_show"] },
  { key: "expired", label: "Expired", statuses: ["expired"] },
];
