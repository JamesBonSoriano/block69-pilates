// Reads the logged-in client's in-app notifications (migration 12) for pages.
// Where it's used: the header (the unread count on the bell). The list itself
// is loaded only when the bell is opened, by loadMyUpdates() in
// src/lib/account/actions.ts (Change 17).
//
// NO CACHING, on purpose: the unread count must always be the real value
// right now. Like src/lib/data/account.ts, this calls `await io()` before
// createClient() (the Step 7 rule), so pages must show it inside <Suspense>.
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

// Counts the logged-in client's unread notifications (for the bell's count).
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
