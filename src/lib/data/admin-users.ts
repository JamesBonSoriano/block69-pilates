// Reads what the admin's ONE-USER pages show (Version 1.4 admin part 2):
// View user, Edit user and Communications (src/app/admin/(panel)/users/[userId]/).
// The Users LIST reads through getAdminUsers() in admin-setup.ts.
//
// NO CACHING, on purpose: the admin must always see live values.
// Every function calls `await io()` before createClient() (the Step 7 rule),
// so pages must show them inside <Suspense>.
//
// SECURITY: admin_get_user and admin_user_bookings (migration 20) start with
// require_admin(); the communications table only lets active admins read
// it (RLS). The pages also call requireAdmin() before loading anything.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { AdminUserBooking, AdminUserDetails, CommunicationRow } from "@/types/app";

// Loads one account's details and totals.
// Takes: the user id from the address.
// Gives back: the details, or null if the id is wrong or doesn't exist.
// Throws if Supabase can't be reached.
export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails | null> {
  if (!isUuid(userId)) return null;
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_user", { p_user_id: userId });
  if (error) {
    throw new Error(`Could not load the account: ${error.message}`);
  }
  return (data[0] as AdminUserDetails | undefined) ?? null;
}

// Loads one account's bookings, newest class first.
// Takes: the user id and how many (at most 100).
// Gives back: the bookings (no expired holds). Throws if it can't load.
export async function getAdminUserBookings(userId: string, limit = 20): Promise<AdminUserBooking[]> {
  if (!isUuid(userId)) return [];
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_bookings", { p_user_id: userId, p_limit: limit });
  if (error) {
    throw new Error(`Could not load the bookings: ${error.message}`);
  }
  return data;
}

// Loads one page of the emails sent to one client, newest first.
// Takes: the user id, the page number (1 = newest) and how many per page.
// Gives back: the messages on that page and how many there are in all.
// Throws if it can't load.
export async function getUserMessages(
  userId: string,
  page: number,
  perPage = 10,
): Promise<{ rows: CommunicationRow[]; total: number }> {
  if (!isUuid(userId)) return { rows: [], total: 0 };
  await io();
  const supabase = await createClient();
  const first = (Math.max(1, page) - 1) * perPage;
  // count: "exact" = also tell us how many rows match in all (for the pages)
  const { data, error, count } = await supabase
    .from("communications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(first, first + perPage - 1);
  if (error) {
    throw new Error(`Could not load the messages: ${error.message}`);
  }
  return { rows: data, total: count ?? 0 };
}
