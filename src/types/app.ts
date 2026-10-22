// Short, friendly names for the database types we use a lot.
// Where it's used: data functions (src/lib/data/) and components.
//
// src/types/database.ts is made by `npm run gen:types` (never edit it by hand;
// re-run that command after every new migration). This file only gives
// nicknames to parts of it, so components don't need long type paths.

import type { Database } from "./database";

// The database's "public" section (tables, functions and enums).
type PublicSchema = Database["public"];

// One row from get_open_sessions(): a dated class with its live seats left.
export type OpenSession =
  PublicSchema["Functions"]["get_open_sessions"]["Returns"][number];

// One editable block of page text from the site_content table.
export type SiteContentRow = PublicSchema["Tables"]["site_content"]["Row"];

// All 10 booking statuses (pending_payment, confirmed, ...).
export type BookingStatus = PublicSchema["Enums"]["booking_status"];

// How a payment was made: gcash, maya, card, bpi or cash.
export type PaymentMethod = PublicSchema["Enums"]["payment_method"];

// One row from get_my_booking() (migrations 6 and 7): one of the logged-in
// client's own bookings, for the pay page, the "You're booked" page, and
// step 2 after "Change details".
// The generated types say every column is always filled in, but some are
// empty (null) for many bookings, so we say so here: no drink picked, no
// voucher, not paid yet.
type MyBookingRow = PublicSchema["Functions"]["get_my_booking"]["Returns"][number];
export type MyBooking = Omit<
  MyBookingRow,
  | "drink_choice"
  | "health_notes"
  | "voucher_code"
  | "voucher_percent_off"
  | "voucher_amount_off"
  | "hold_expires_at"
  | "paid_amount"
  | "paid_method"
  | "paid_at"
> & {
  drink_choice: string | null;
  health_notes: string | null;
  voucher_code: string | null;
  voucher_percent_off: number | null;
  voucher_amount_off: number | null;
  hold_expires_at: string | null;
  paid_amount: number | null;
  paid_method: PaymentMethod | null;
  paid_at: string | null;
};

// What Cancel / Transfer means for one confirmed booking right now (from the
// database's change_rule(), migration 8):
//   free_transfer       the cafe cancelled the class: free transfer, any time
//   started             the class has started: nothing can change
//   transfer            more than 24h before: transfer once (no cancel)
//   already_transferred more than 24h before, but it was moved once already
//   voucher             12 to 24h before: cancel gives a 50% code
//   no_credit           less than 12h before: cancel gives nothing
export type ChangeRule =
  | "free_transfer"
  | "started"
  | "transfer"
  | "already_transferred"
  | "voucher"
  | "no_credit";

// One row from get_my_bookings() (migration 8): one of the client's own
// bookings for My Bookings. As with MyBooking, the columns that can be empty
// are marked here (the generated types say they never are).
type MyBookingListRow = PublicSchema["Functions"]["get_my_bookings"]["Returns"][number];
export type MyBookingListItem = Omit<
  MyBookingListRow,
  | "drink_choice"
  | "moved_from_date"
  | "moved_from_start_time"
  | "moved_to_date"
  | "moved_to_start_time"
  | "paid_amount"
  | "paid_method"
  | "change_rule"
> & {
  drink_choice: string | null;
  moved_from_date: string | null;
  moved_from_start_time: string | null;
  moved_to_date: string | null;
  moved_to_start_time: string | null;
  paid_amount: number | null;
  paid_method: PaymentMethod | null;
  change_rule: ChangeRule | null; // only for confirmed bookings
};

// How far a payment got: pending, paid, failed, expired, rejected, refunded.
export type PaymentStatus = PublicSchema["Enums"]["payment_status"];

// One row from get_my_payments() (migration 8): one of the client's own
// payments, with the booking and class it paid for.
type MyPaymentRow = PublicSchema["Functions"]["get_my_payments"]["Returns"][number];
export type MyPayment = Omit<
  MyPaymentRow,
  "method" | "paymongo_ref" | "paid_at" | "drink_choice" | "voucher_code" | "now_date" | "now_start_time" | "now_end_time"
> & {
  method: PaymentMethod | null; // empty while a PayMongo checkout is still open
  paymongo_ref: string | null;
  paid_at: string | null;
  drink_choice: string | null;
  voucher_code: string | null;
  now_date: string | null; // where the booking was moved to (empty = never moved)
  now_start_time: string | null;
  now_end_time: string | null;
};

// A voucher's state on My Vouchers (get_my_vouchers(), migration 8).
export type VoucherState = "active" | "reserved" | "used" | "expired";

// One row from get_my_vouchers(): one of the client's own personal codes.
type MyVoucherRow = PublicSchema["Functions"]["get_my_vouchers"]["Returns"][number];
export type MyVoucher = Omit<MyVoucherRow, "percent_off" | "amount_off" | "expires_at" | "state" | "used_for_date"> & {
  percent_off: number | null; // one of these two is filled in
  amount_off: number | null;
  expires_at: string | null; // empty = never expires
  state: VoucherState;
  used_for_date: string | null; // the class it was used on
};
