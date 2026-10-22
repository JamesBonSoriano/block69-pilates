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

// What addWalkIn() answers (the Walk-in form).
export type WalkInState = {
  error?: string; // a message for the whole form
  fieldErrors?: Partial<Record<string, string>>; // messages for single fields
  values?: Partial<Record<string, string>>; // what was typed, to fill the form again
  // It worked: what to show in the "Booked" box
  done?: {
    bookingId: string;
    guestName: string;
    sessionId: string;
    classLabel: string; // e.g. "Sat, Oct 24 · 9:00 – 9:50 AM"
    total: number; // pesos, worked out by the database
    paidWith: string; // e.g. "Cash" or "GCash transfer"
    seatsLeft: number; // free seats left in that class now
  };
};

// The starting state of the Walk-in form.
export const emptyWalkInState: WalkInState = {};

// What cancelClass() answers (the Cancel class box).
export type CancelClassState = {
  error?: string;
  done?: { bookedCount: number }; // how many bookings were holding a seat
};

// The starting state of the Cancel class box.
export const emptyCancelClassState: CancelClassState = {};
