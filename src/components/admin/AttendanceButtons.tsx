"use client";
// The big Attended / No-show buttons for one guest.
// Where it's used: the admin booking details page (Version 1.4 removed the
// Attendance list page).
//
// Built for a phone at the counter: each button is at least 48px tall.
//   confirmed  -> two buttons: Attended (green) and No-show
//   attended   -> green "Attended" badge + a small "Change to no-show"
//   no-show    -> red "No-show" badge + a small "Change to attended"
// Each button sends the form to setAttendance() (src/lib/admin/actions.ts),
// which calls admin_set_attendance(). The database decides if it's allowed
// (PAID confirmed / attended / no-show bookings, on or after the class day,
// not in a class the cafe cancelled).
//
// "use client" = shows "Saving…" and any error right next to the guest.

import { useActionState } from "react";
import { setAttendance } from "@/lib/admin/actions";
import { emptyAttendanceState } from "@/lib/admin/form-state";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { BookingStatus } from "@/types/app";

type AttendanceButtonsProps = {
  bookingId: string;
  status: BookingStatus; // the booking's status when the page was drawn
  guestName: string; // for screen readers: "Mark Ana Cruz as attended"
};

// The attendance buttons for one booking.
// Takes: the props above.
// Gives back: a small form with the buttons (or the badge + change button).
export function AttendanceButtons({ bookingId, status, guestName }: AttendanceButtonsProps) {
  const [state, formAction, pending] = useActionState(setAttendance, emptyAttendanceState);
  // Show the newest answer straight away, even before the page has refreshed
  const current = state.saved ?? status;

  return (
    <form action={formAction} className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <input type="hidden" name="booking_id" value={bookingId} />

      {current === "confirmed" ? (
        // Not marked yet: the two big buttons. The pressed button's
        // name/value (status=attended or status=no_show) is sent with the form.
        <div className="flex gap-2">
          <button
            type="submit"
            name="status"
            value="attended"
            disabled={pending}
            aria-label={`Mark ${guestName} as attended`}
            className={cn(bigButton, "border-success bg-success-bg text-success hover:bg-success hover:text-white")}
          >
            Attended
          </button>
          <button
            type="submit"
            name="status"
            value="no_show"
            disabled={pending}
            aria-label={`Mark ${guestName} as no-show`}
            className={cn(bigButton, "border-line bg-white text-ink hover:border-error hover:text-error")}
          >
            No-show
          </button>
        </div>
      ) : (
        // Already marked: the result, and a way to fix a mistake
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant={current === "attended" ? "success" : "error"} className="px-3 py-1.5 text-xs">
            {current === "attended" ? "Attended" : "No-show"}
          </Badge>
          <button
            type="submit"
            name="status"
            value={current === "attended" ? "no_show" : "attended"}
            disabled={pending}
            className="min-h-11 rounded-full px-3 text-xs font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg disabled:opacity-50"
          >
            {current === "attended" ? "Change to no-show" : "Change to attended"}
            <span className="sr-only"> for {guestName}</span>
          </button>
        </div>
      )}

      {/* role="status" / "alert": screen readers hear "Saving…" and errors */}
      <p role="status" className="text-xs text-muted empty:hidden">
        {pending ? "Saving…" : ""}
      </p>
      {state.error && (
        <p role="alert" className="max-w-xs text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}

// The look of the two big buttons: pill shape, 48px tall, half the row each
// on phones.
const bigButton =
  "min-h-12 flex-1 rounded-full border-[1.25px] px-5 font-heading text-sm font-semibold transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown " +
  "disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none";
