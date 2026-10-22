// Reads what the My Account pages show: the logged-in client's own bookings,
// payments, vouchers and profile details.
// Where it's used: the pages in src/app/(client)/account/ and the account
// actions (src/lib/account/actions.ts).
//
// NO CACHING, on purpose: booking statuses, holds and voucher states must
// always be the real values right now. Nothing here says "use cache".
// The "get" functions are for PAGES: they call `await io()` before
// createClient() (the Step 7 rule, see src/lib/supabase/server.ts), so pages
// must show them inside <Suspense>.
//
// The database functions (migration 8) only ever give back the CALLER's own
// rows, even for admins, so nobody can see someone else's data here.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { MyBookingListItem, MyPayment, MyVoucher } from "@/types/app";

// A logged-in Supabase client (what createClient() gives back).
type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Loads the logged-in client's bookings (for a page).
// Takes: nothing.
// Gives back: their bookings, earliest class first (see get_my_bookings in
// migration 8 for what each row has). Throws if Supabase can't be reached.
export async function getMyBookings(): Promise<MyBookingListItem[]> {
  await io();
  return loadMyBookings(await createClient());
}

// Same as getMyBookings, with a Supabase client the caller already made
// (used by the cancel action, which doesn't need io()).
// Takes: a logged-in Supabase client.
// Gives back: the bookings. Throws if Supabase can't be reached.
export async function loadMyBookings(supabase: ServerClient): Promise<MyBookingListItem[]> {
  const { data, error } = await supabase.rpc("get_my_bookings");
  if (error) {
    throw new Error(`Could not load your bookings: ${error.message}`);
  }
  // The generated type says no column is ever empty; MyBookingListItem says
  // which ones can be (see src/types/app.ts).
  return data as MyBookingListItem[];
}

// Loads all of the logged-in client's payments (Payments page).
// Takes: nothing.
// Gives back: their payments, newest first. Throws if Supabase can't be reached.
export async function getMyPayments(): Promise<MyPayment[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_payments");
  if (error) {
    throw new Error(`Could not load your payments: ${error.message}`);
  }
  return data as MyPayment[];
}

// Loads ONE of the logged-in client's payments (the receipt page).
// Takes: the payment id from the address.
// Gives back: the payment, or null if the id is wrong, it doesn't exist, or
// it's someone else's. Throws if Supabase can't be reached.
export async function getMyPayment(paymentId: string): Promise<MyPayment | null> {
  if (!isUuid(paymentId)) return null;
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_payments", { p_payment_id: paymentId });
  if (error) {
    throw new Error(`Could not load your payment: ${error.message}`);
  }
  return (data[0] as MyPayment | undefined) ?? null;
}

// Loads the logged-in client's personal voucher codes (My Vouchers).
// Takes: nothing.
// Gives back: their codes, valid ones first. Promo codes are never included.
// Throws if Supabase can't be reached.
export async function getMyVouchers(): Promise<MyVoucher[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vouchers");
  if (error) {
    throw new Error(`Could not load your vouchers: ${error.message}`);
  }
  return data as MyVoucher[];
}

// The profile details My Profile and Notifications show, beyond what
// getCurrentUser() already gives (name, email, mobile, Instagram).
export type MyProfileExtras = {
  birthday: string | null; // "YYYY-MM-DD", or null if not given
  emailReminders: boolean; // send the day-before reminder email?
  memberSince: string; // when the account was made (an exact moment)
};

// Loads the extra profile details (for a page).
// Takes: the logged-in user's id (from requireUser()).
// Gives back: birthday, reminder choice and join date. Throws if Supabase
// can't be reached or the profile is missing.
export async function getMyProfileExtras(userId: string): Promise<MyProfileExtras> {
  await io();
  const supabase = await createClient();
  // Row Level Security lets a client read only their own profile row, and
  // .eq("id", userId) makes sure an admin gets their OWN row too.
  const { data, error } = await supabase
    .from("profiles")
    .select("birthday, email_reminders, created_at")
    .eq("id", userId)
    .single();
  if (error) {
    throw new Error(`Could not load your profile: ${error.message}`);
  }
  return {
    birthday: data.birthday,
    emailReminders: data.email_reminders,
    memberSince: data.created_at,
  };
}
