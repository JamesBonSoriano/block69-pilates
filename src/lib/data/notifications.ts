// Reads the logged-in client's in-app notifications (migration 12).
// Where it's used: My Account > Notifications (the list) and the header
// (the unread dot on the person icon).
//
// NO CACHING, on purpose: the list and the unread count must always be the
// real values right now. Like src/lib/data/account.ts, these call
// `await io()` before createClient() (the Step 7 rule), so pages must show
// them inside <Suspense>.
//
// The database functions only ever give back the CALLER's own rows (they
// filter on the login, and Row Level Security does too), so nobody can see
// someone else's notifications here.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// One update, as get_my_notifications() gives it back.
export type MyNotification = {
  id: string;
  kind: Database["public"]["Enums"]["notification_kind"];
  voucher_code: string | null; // the 50% code, for cancelled_with_voucher
  created_at: string; // when it happened (an exact moment)
  read_at: string | null; // empty = not seen yet
  booking_id: string | null;
  class_date: string | null; // "YYYY-MM-DD", the class it's about
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
};

// Loads the logged-in client's notifications (for the Notifications page).
// Takes: nothing.
// Gives back: up to 50 updates, newest first. Throws if Supabase can't be reached.
export async function getMyNotifications(): Promise<MyNotification[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: 50 });
  if (error) {
    throw new Error(`Could not load your notifications: ${error.message}`);
  }
  // The generated type says no column is ever empty; MyNotification says
  // which ones can be.
  return data as MyNotification[];
}

// Counts the logged-in client's unread notifications (for the header dot).
// Takes: nothing.
// Gives back: the number (0 for guests). Never throws: if Supabase can't be
// reached the header just shows no dot.
export async function getMyUnreadCount(): Promise<number> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_unread_notification_count");
  if (error) {
    console.error("Could not count unread notifications:", error.code);
    return 0;
  }
  return data ?? 0;
}
