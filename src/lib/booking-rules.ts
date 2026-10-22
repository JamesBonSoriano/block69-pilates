// Small helpers for SHOWING the booking rules in the page.
// Where it's used: the session cards (Home now; booking step 1 later).
//
// These only decide how things look. The real rules (seat check, cutoff,
// holds, cancellations) live in the database functions, so nobody can skip
// them by changing the page.

import type { BadgeVariant } from "@/components/ui/Badge";

// Picks the seats-left badge for one class.
// Takes: the class's seats left and its state from get_open_sessions()
// ("open", "full", "booking_closed", "closed" or "cancelled").
// Gives back: the badge text and color, e.g. { label: "1 left", variant: "warning" }.
export function seatBadge(
  seatsLeft: number,
  state: string,
): { label: string; variant: BadgeVariant } {
  if (state === "cancelled") return { label: "Cancelled", variant: "error" };
  if (state === "closed") return { label: "Closed", variant: "neutral" };
  if (state === "booking_closed") return { label: "Booking closed", variant: "neutral" };
  if (seatsLeft <= 0 || state === "full") return { label: "Full", variant: "neutral" };
  // Only one seat left: warn with the yellow "few seats" color
  if (seatsLeft === 1) return { label: "1 left", variant: "warning" };
  return { label: `${seatsLeft} left`, variant: "success" };
}
