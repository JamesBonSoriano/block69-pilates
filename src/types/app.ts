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

// ---------------------------------------------------------------------------
// Admin pages (migration 9, Step 11 part 1)
// As above, the generated types say no column is ever empty, so the columns
// that CAN be empty (walk-ins have no email, unpaid bookings have no payment,
// ...) are marked here.
// ---------------------------------------------------------------------------

// Who handled a payment: paymongo, manual (GCash / BPI transfer) or cash.
export type PaymentProvider = PublicSchema["Enums"]["payment_provider"];

// open / closed / cancelled (a class's status).
export type SessionStatus = PublicSchema["Enums"]["session_status"];

// The Dashboard numbers (admin_dashboard_summary). Nothing here is ever empty.
export type AdminDashboardSummary =
  PublicSchema["Functions"]["admin_dashboard_summary"]["Returns"][number];

// One class for the admin (admin_list_sessions): past ones too, with seats
// taken / left and how many guests still need Attended / No-show.
export type AdminSession = PublicSchema["Functions"]["admin_list_sessions"]["Returns"][number];

// One guest in a class (admin_class_rosters): Attendance list, Dashboard.
type AdminRosterRow = PublicSchema["Functions"]["admin_class_rosters"]["Returns"][number];
export type AdminRosterItem = Omit<
  AdminRosterRow,
  "guest_contact" | "guest_email" | "health_notes" | "drink_choice" | "paid_amount" | "paid_method" | "paid_provider" | "hold_expires_at"
> & {
  guest_contact: string | null;
  guest_email: string | null; // walk-ins have no account, so no email
  health_notes: string | null;
  drink_choice: string | null; // null = "decide at the cafe"
  paid_amount: number | null; // null = not paid (yet)
  paid_method: PaymentMethod | null;
  paid_provider: PaymentProvider | null;
  hold_expires_at: string | null;
};

// One row of the admin Bookings list (admin_search_bookings).
type AdminBookingListRow = PublicSchema["Functions"]["admin_search_bookings"]["Returns"][number];
export type AdminBookingListItem = Omit<
  AdminBookingListRow,
  "guest_contact" | "guest_email" | "drink_choice" | "paid_amount" | "paid_method" | "paid_provider"
> & {
  guest_contact: string | null;
  guest_email: string | null;
  drink_choice: string | null;
  paid_amount: number | null;
  paid_method: PaymentMethod | null;
  paid_provider: PaymentProvider | null;
};

// One payment inside admin_get_booking's "payments" list (it arrives as JSON).
export type AdminBookingPayment = {
  id: string;
  booking_id: string; // the ORIGINAL booking after a transfer
  provider: PaymentProvider;
  method: PaymentMethod | null;
  amount: number;
  status: PaymentStatus;
  paymongo_ref: string | null;
  has_screenshot: boolean;
  verified_by_name: string | null; // the admin who recorded or checked it
  paid_at: string | null;
  created_at: string;
};

// One booking with everything about it (admin_get_booking): the admin's
// booking details page.
type AdminBookingRow = PublicSchema["Functions"]["admin_get_booking"]["Returns"][number];
export type AdminBookingDetails = Omit<
  AdminBookingRow,
  | "hold_expires_at"
  | "agreed_at"
  | "health_notes"
  | "drink_choice"
  | "voucher_code"
  | "voucher_source"
  | "user_id"
  | "guest_email"
  | "guest_contact"
  | "guest_instagram"
  | "account_active"
  | "moved_from_booking_id"
  | "moved_from_date"
  | "moved_from_start_time"
  | "moved_to_booking_id"
  | "moved_to_date"
  | "moved_to_start_time"
  | "payments"
> & {
  hold_expires_at: string | null;
  agreed_at: string | null;
  health_notes: string | null;
  drink_choice: string | null;
  voucher_code: string | null;
  voucher_source: PublicSchema["Enums"]["voucher_source"] | null;
  user_id: string | null; // null = walk-in
  guest_email: string | null;
  guest_contact: string | null;
  guest_instagram: string | null;
  account_active: boolean | null; // null = walk-in (no account)
  moved_from_booking_id: string | null;
  moved_from_date: string | null;
  moved_from_start_time: string | null;
  moved_to_booking_id: string | null;
  moved_to_date: string | null;
  moved_to_start_time: string | null;
  payments: AdminBookingPayment[];
};

// ---------------------------------------------------------------------------
// Admin setup pages (migration 10, Step 11 part 2)
// Same idea as above: the columns that CAN be empty are marked here.
// ---------------------------------------------------------------------------

// One payment on the admin Payments page (admin_list_payments).
type AdminPaymentRow = PublicSchema["Functions"]["admin_list_payments"]["Returns"][number];
export type AdminPayment = Omit<
  AdminPaymentRow,
  "method" | "paymongo_ref" | "screenshot_path" | "verified_by_name" | "paid_at" | "guest_email" | "guest_contact"
> & {
  method: PaymentMethod | null; // empty while a PayMongo checkout is still open
  paymongo_ref: string | null;
  screenshot_path: string | null; // a file in the private payment-screenshots bucket
  verified_by_name: string | null;
  paid_at: string | null;
  guest_email: string | null; // walk-ins have no email
  guest_contact: string | null;
};

// One day + method of paid money (admin_earnings). Nothing here is empty.
export type AdminEarningRow = PublicSchema["Functions"]["admin_earnings"]["Returns"][number];

// The money totals on the admin Payments page (admin_billing_summary,
// migration 11): paid today / this week / this month, mat rental donations,
// and how many bookings need the admin. Nothing here is ever empty.
export type AdminBillingSummary = PublicSchema["Functions"]["admin_billing_summary"]["Returns"][number];

// A voucher's state for the admin (admin_list_vouchers): the client's states
// plus "off" (a promo code the admin turned off).
export type AdminVoucherState = VoucherState | "off";

// One voucher on the Pricing & Vouchers page (admin_list_vouchers).
type AdminVoucherRow = PublicSchema["Functions"]["admin_list_vouchers"]["Returns"][number];
export type AdminVoucher = Omit<
  AdminVoucherRow,
  "percent_off" | "amount_off" | "expires_at" | "disabled_at" | "owner_name" | "owner_email" | "state" | "used_for_date"
> & {
  percent_off: number | null; // one of these two is filled in
  amount_off: number | null;
  expires_at: string | null; // empty = never expires
  disabled_at: string | null; // empty = on
  owner_name: string | null; // personal codes only
  owner_email: string | null;
  state: AdminVoucherState;
  used_for_date: string | null;
};

// One account on the Users page (admin_list_users).
type AdminUserRow = PublicSchema["Functions"]["admin_list_users"]["Returns"][number];
export type AdminUser = Omit<AdminUserRow, "full_name" | "email" | "mobile" | "instagram" | "last_class_date"> & {
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  instagram: string | null;
  last_class_date: string | null;
};

// What admin_change_rule() says for one booking: the client's rules
// (ChangeRule) plus "late_payment" (paid after the hold ended, class full).
export type AdminChangeRule = ChangeRule | "late_payment";

// What an admin did to one booking (booking_admin_actions):
// moved it, or cancelled it with or without a 50% code.
export type AdminActionKind = "transfer" | "cancel_voucher" | "cancel_no_credit";

// One saved admin change, inside admin_booking_change_info's "actions" list.
export type AdminBookingAction = {
  id: string;
  action: AdminActionKind;
  normal_rule: AdminChangeRule;
  overridden: boolean; // true = different from the normal rule (has a reason)
  note: string | null; // the admin's reason
  admin_name: string | null;
  created_at: string;
  booking_id: string; // the booking that was changed
  new_booking_id: string | null; // for a transfer: the new booking
  voucher_code: string | null; // for cancel_voucher: the 50% code
};

// What the admin may do with one booking (admin_booking_change_info).
export type AdminBookingChangeInfo = {
  can_change: boolean; // confirmed or late payment
  rule: AdminChangeRule | null;
  normal_action: AdminActionKind | null; // allowed without a reason (null = nothing)
  voucher_allowed: boolean; // false for walk-ins
  actions: AdminBookingAction[];
};

// One weekly class slot (schedule_templates table).
export type ScheduleTemplate = PublicSchema["Tables"]["schedule_templates"]["Row"];
