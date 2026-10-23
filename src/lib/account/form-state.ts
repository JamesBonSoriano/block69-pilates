// The shapes of the answers the My Account actions send back to the page.
// Where it's used: src/lib/account/actions.ts (makes them) and the forms and
// buttons in src/components/account/ (show them).
// (They live in their own file because a "use server" file may only export
// functions, not types or plain values.)

import type { NotificationListItem } from "@/lib/notifications";
import type { ChangeRule } from "@/types/app";

// What cancelBooking() answers (the Cancel box on My Bookings).
export type CancelBookingState = {
  // Something went wrong, e.g. "Only confirmed bookings can be cancelled."
  error?: string;
  // The time rule changed while the box was open (e.g. the class went from
  // 12h+ to under 12h away). Nothing was cancelled: the box shows the new
  // explanation and asks again.
  changed?: { rule: ChangeRule; timeLeft: string; cancelOpensAt: string };
  // It worked: the new status, and the voucher (12 to 24h before class only)
  done?: {
    status: "cancelled_with_voucher" | "forfeited";
    voucherCode: string | null;
    voucherExpires: string | null; // already formatted, e.g. "December 22, 2026"
  };
};

// The starting state of the Cancel box: nothing to show yet.
export const emptyCancelBookingState: CancelBookingState = {};

// What transferBooking() answers when it could NOT move the booking.
// (When it works, it sends the person back to My Bookings instead.)
export type TransferBookingState = { error?: string };

// The starting state of the transfer form.
export const emptyTransferBookingState: TransferBookingState = {};

// What the My Profile forms (details, password, deactivate) answer.
export type AccountFormState = {
  error?: string; // a message for the whole form
  fieldErrors?: Partial<Record<string, string>>; // messages for single fields
  values?: Partial<Record<string, string>>; // what was typed (never passwords)
  success?: string; // e.g. "Your details are saved."
};

// The starting state of each My Profile form.
export const emptyAccountFormState: AccountFormState = {};

// What loadMyUpdates() answers (the header's bell): the updates, newest
// first, or a message if they couldn't be loaded.
export type MyUpdatesResult = { updates: NotificationListItem[] } | { error: string };

// What setEmailReminders() answers (the switch on Notifications).
export type ReminderState = {
  value?: boolean; // the saved choice
  error?: string;
};
