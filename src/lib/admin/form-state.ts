// The shapes of the answers the admin actions send back to the page.
// Where it's used: src/lib/admin/actions.ts (makes them) and the admin
// buttons and forms in src/components/admin/ (show them).
// (They live in their own file because a "use server" file may only export
// functions, not types or plain values.)

import type { BookingStatus } from "@/types/app";

// What setAttendance() answers (the Attended / No-show buttons).
export type AttendanceState = {
  error?: string; // e.g. "You can only mark attendance on or after the class day."
  saved?: BookingStatus; // the new status, "attended" or "no_show"
};

// The starting state of the attendance buttons: nothing to show yet.
export const emptyAttendanceState: AttendanceState = {};

// What cancelClass() answers (the Cancel class box).
export type CancelClassState = {
  error?: string;
  done?: { bookedCount: number }; // how many bookings were holding a seat
};

// The starting state of the Cancel class box.
export const emptyCancelClassState: CancelClassState = {};

// What the admin SETUP actions answer (Step 11 part 2): Settings, Pricing,
// promo codes, Schedule, Content, Users and the payment review buttons.
// One shape for all of them, so one form component (AdminActionForm) can
// show the result of any of them.
export type AdminSaveState = {
  error?: string; // what went wrong, in plain words (shown in red)
  saved?: string; // what was done, e.g. "Prices saved." (shown in green)
  savedAt?: number; // when, so the same message twice still shows as new
};

// The starting state of every setup form: nothing to show yet.
export const emptySaveState: AdminSaveState = {};

// What changeOneBooking() answers (the "Cancel booking" box on the admin
// booking details page).
export type BookingChangeState = {
  error?: string;
  done?: {
    message: string; // e.g. "Cancelled with no credit (forfeited)."
    voucherCode?: string; // after a cancel with a 50% code: the code
    overridden: boolean; // true = it was an override (the reason was saved)
  };
};

// The starting state of the Cancel booking box.
export const emptyBookingChangeState: BookingChangeState = {};
