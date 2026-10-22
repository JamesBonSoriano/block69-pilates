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
