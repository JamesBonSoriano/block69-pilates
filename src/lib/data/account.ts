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
import { hasGoogleLogin, hasPasswordLogin } from "@/lib/auth/sign-in-methods";
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

// One thing that still stops the person deleting their account (migration
// 16's my_account_deletion_blockers()).
export type DeletionBlocker = {
  kind: "upcoming_class" | "seat_on_hold" | "payment_checking";
  howMany: number;
  firstDate: string | null; // "YYYY-MM-DD", the earliest class it's about
};

// The login details My Profile's Account Information and Account Management
// cards need (Change 17).
export type MyAccountInfo = {
  hasPassword: boolean; // false = only "Continue with Google"
  hasGoogle: boolean; // Google is one of their logins
  pendingEmail: string | null; // an email change that is waiting for its codes
  // What blocks Delete account ([] = nothing), or null if it couldn't be
  // checked (e.g. the database doesn't have migration 16 yet)
  deletionBlockers: DeletionBlocker[] | null;
};

// Loads the login details and Delete account blockers (for My Profile).
// Takes: nothing.
// Gives back: MyAccountInfo. Never throws for the blockers (they show as
// "couldn't check"); throws if the login can't be read.
export async function getMyAccountInfo(): Promise<MyAccountInfo> {
  await io();
  const supabase = await createClient();
  // getUser() asks Supabase for the full user (its logins and any email
  // change waiting for codes); getClaims() alone doesn't have those
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    throw new Error(`Could not load your login details: ${error?.message ?? "no user"}`);
  }
  const user = userData.user;

  // Only the caller's own bookings are looked at (the function filters on the login)
  const { data: blockers, error: blockersError } = await supabase.rpc("my_account_deletion_blockers");
  if (blockersError) {
    console.error("Could not check Delete account:", blockersError.code);
  }

  return {
    hasPassword: hasPasswordLogin(user),
    hasGoogle: hasGoogleLogin(user),
    pendingEmail: user.new_email ?? null,
    deletionBlockers: blockersError
      ? null
      : blockers.map((row) => ({
          kind: row.kind as DeletionBlocker["kind"],
          howMany: row.how_many,
          firstDate: row.first_date ?? null,
        })),
  };
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
