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

// What cancelAppointment() answers: the "Cancel appointment" box (3 choices)
// on the admin manage page (Version 1.7; it replaced the old 2-choice box).
export type CancelAppointmentState = {
  error?: string;
  done?: {
    message: string; // e.g. "Cancelled. The client got a 100% code for one class."
    voucherCode?: string; // the 100% or 50% code, if one was given
    emailNote: string; // whether the client's email went out, in plain words
    emailSent: boolean;
  };
};

// The starting state of the Cancel appointment box.
export const emptyCancelAppointmentState: CancelAppointmentState = {};

// What rescheduleBooking() answers (the "Re-schedule" box on the admin
// manage page, Version 1.6).
export type RescheduleState = {
  error?: string;
  done?: {
    message: string; // e.g. "Re-scheduled to Sat, Nov 21 · 10:15 AM."
    newBookingId: string; // the new booking (the page opens it after)
    emailNote: string; // whether the client's email went out
    emailSent: boolean;
  };
};

// The starting state of the Re-schedule box.
export const emptyRescheduleState: RescheduleState = {};
