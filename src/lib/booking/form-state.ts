// The shapes of the answers the booking actions send back to the page.
// Where it's used: src/lib/booking/actions.ts (makes them) and the booking
// step 2 form (src/app/(client)/book/details/BookingDetailsForm.tsx) shows them.
// (They live in their own file because a "use server" file may only export
// functions, not types or plain values.)

// What holdSeat() answers when it could NOT hold the seat.
// (When it works, it doesn't answer: it sends the person to the pay page.)
export type HoldSeatState = {
  // A message for the whole form, e.g. "Sorry, this class is full."
  error?: string;
  // Messages for single fields, e.g. { mobile: "Please enter a valid ..." }
  fieldErrors?: Partial<Record<string, string>>;
  // What the person typed and picked, so the form can fill it back in
  values?: Partial<Record<string, string>>;
  // true = this class can't be booked any more (full, closed, past the
  // cutoff), so the form shows a "Pick another class" button
  pickAnother?: boolean;
};

// The starting state of the form: nothing to show yet.
export const emptyHoldSeatState: HoldSeatState = {};

// What releaseHold() answers when it could NOT release the hold (the pay
// page's "Change details" button). When it works, it sends the person back
// to step 2 instead of answering.
export type ReleaseHoldState = { error?: string };

// The starting state of the "Change details" button: nothing to show.
export const emptyReleaseHoldState: ReleaseHoldState = {};

// What previewVoucher() answers for the "Apply" button.
export type VoucherPreview =
  // The code works: its cleaned-up code, a short label like
  // "10% off the class fee", and how many pesos it takes off the class fee
  | { ok: true; code: string; label: string; discount: number }
  // The code can't be used: a plain-English reason
  | { ok: false; error: string };
