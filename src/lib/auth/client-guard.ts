// A check for the CLIENT Server Actions (booking, paying, My Account):
// admin accounts may not use them (Revisions part 1, item 1).
// Where it's used: src/lib/booking/actions.ts, src/lib/booking/payment-actions.ts
// and src/lib/account/actions.ts.
//
// The pages are already closed to admins (src/proxy.ts + requireClient()),
// but a Server Action can be called without opening its page, so each one
// checks again here.
//
// It lives in its own file, not inside a "use server" file, because every
// function exported from a "use server" file can be called from the browser.

import "server-only"; // never sent to the browser
import { isAdmin, type ServerClient } from "@/lib/admin/action-helpers";

// Shown when an admin account tries to book, pay or change My Account.
export const STAFF_ACCOUNT_ERROR =
  "Staff accounts can't book classes or use My Account. Please log in with a client account.";

// Checks if the caller is an active admin (the database's is_admin()).
// Takes: the logged-in Supabase client.
// Gives back: true if the action must be refused (an admin), false for
// clients and guests (guests are refused by the action's own login check).
export async function isStaffAccount(supabase: ServerClient): Promise<boolean> {
  return isAdmin(supabase);
}
