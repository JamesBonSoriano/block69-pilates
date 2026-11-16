// Version 1.7: people see the word "Re-schedule", never "Transfer", for
// moving a booking to another class. Some older database functions still
// say "transfer" in their error messages (cancel_my_booking,
// transfer_my_booking, the admin cancel). Rewriting those functions only for
// wording is risky, so the website swaps the exact messages here instead.
// (DB columns, enum values and routes keep the word "transfer" on purpose.
// A GCash / BPI "transfer" is a payment, not a re-schedule, so those
// messages are NOT in this list.)
// Where it's used: friendlyDatabaseError() in src/lib/database-errors.ts.

// Old database message -> the same message with the new word.
// (Exported so the unit test can check each old message really exists.)
export const RESCHEDULE_MESSAGES: Record<string, string> = {
  "The cafe cancelled this class, so you can move to another class for free. Please use Transfer instead.":
    "The cafe cancelled this class, so you can move to another class for free. Please use Re-schedule instead.",
  "This booking was already transferred once, so it can't be moved again. You can cancel it from 24 hours before class and get a 50% voucher.":
    "This booking was already re-scheduled once, so it can't be moved again. You can cancel it from 24 hours before class and get a 50% voucher.",
  "Your class is more than 24 hours away, so please use Transfer to move to another class instead of cancelling.":
    "Your class is more than 24 hours away, so please use Re-schedule to move to another class instead of cancelling.",
  "This booking has already been transferred.": "This booking has already been re-scheduled.",
  "Only confirmed bookings can be transferred.": "Only confirmed bookings can be re-scheduled.",
  "Only confirmed bookings and late payments can be transferred.":
    "Only confirmed bookings and late payments can be re-scheduled.",
  "This booking was already transferred once. A booking can only be transferred one time.":
    "This booking was already re-scheduled once. A booking can only be re-scheduled one time.",
  "Transfers are only allowed more than 24 hours before class.":
    "Re-scheduling is only allowed more than 24 hours before class.",
  "Walk-ins have no account, so they can't get a 50% code. Choose \"no credit\", or transfer them instead.":
    "Walk-ins have no account, so they can't get a 50% code. Choose \"no credit\", or re-schedule them instead.",
  "The transfer rules don't allow this booking to move right now (more than 24 hours before class, once only), so please write a reason. It is saved with the booking.":
    "The re-schedule rules don't allow this booking to move right now (more than 24 hours before class, once only), so please write a reason. It is saved with the booking.",
};

// Swaps an old "transfer" database message for its "re-schedule" wording.
// Takes: the message from the database.
// Gives back: the new wording, or the same message if it isn't in the list.
export function rescheduleWording(message: string): string {
  return RESCHEDULE_MESSAGES[message] ?? message;
}
