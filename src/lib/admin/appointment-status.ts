// Works out the status line for ONE appointment's details (Version 1.6):
// the simple word (Pending, Confirmed, Done, Cancelled, Re-scheduled) and the
// exact reason under it, e.g. "Cancelled · No-show".
// Where it's used: the admin view page (/admin/appointments/[bookingId]),
// the manage page (.../manage) and the appointment PDF (.../pdf).
// The words themselves live in appointmentStatus() (src/lib/admin/display.ts).

import type { BadgeVariant } from "@/components/ui/Badge";
import { appointmentStatus, cafeCancelOutcome, type AppointmentGroup } from "@/lib/admin/display";
import { classStartsAt } from "@/lib/booking-rules";
import type { AdminBookingAction, AdminBookingDetails } from "@/types/app";

// The status of one appointment on its details page.
// Takes: the booking (admin_get_booking), "now" in milliseconds, and
// (Version 1.7, optional) its admin log rows, so an admin cancel can say what
// the cafe gave (e.g. "Refunded outside the website").
// Gives back: the group, the badge word and colour, the reason (or null),
// and text = the two together for the PDF, e.g. "Cancelled · No-show".
export function bookingDetailsStatus(
  booking: AdminBookingDetails,
  nowMs: number,
  actions: AdminBookingAction[] = [],
): { group: AppointmentGroup; label: string; variant: BadgeVariant; reason: string | null; text: string } {
  const sessionCancelled = booking.session_status === "cancelled";
  // The class is over (its END time has passed)
  const classEnded = classStartsAt(booking.class_date, booking.end_time).getTime() <= nowMs;
  const status = appointmentStatus(booking.shown_status, {
    // Seconds left on an unpaid seat hold (0 when none or ended)
    holdSecondsLeft: booking.hold_expires_at
      ? Math.max(0, (new Date(booking.hold_expires_at).getTime() - nowMs) / 1000)
      : 0,
    // Still confirmed after the class ended (Version 1.5)
    attendanceDue: booking.shown_status === "confirmed" && !sessionCancelled && classEnded,
    sessionCancelled,
    // A GCash / BPI screenshot was rejected (the booking is then expired)
    paymentRejected: booking.payments.some((pay) => pay.status === "rejected"),
    // Version 1.7: cancelled by an admin (100% code, 50% code, no credit, refunded)
    cafeCancel: cafeCancelOutcome(booking.booking_id, actions),
  });
  return { ...status, text: status.reason ? `${status.label} · ${status.reason}` : status.label };
}
