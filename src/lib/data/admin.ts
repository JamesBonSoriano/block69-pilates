// Reads what the admin pages show: the Dashboard numbers, classes with seats
// taken, who is in each class, the Bookings list and one booking's details.
// Where it's used: the pages in src/app/admin/ (Dashboard, Bookings,
// booking details, Walk-in, Attendance).
//
// NO CACHING, on purpose: seats, holds, statuses and money must always be the
// real values right now. Nothing here says "use cache".
// Every function calls `await io()` before createClient() (the Step 7 rule,
// see src/lib/supabase/server.ts), so pages must show them inside <Suspense>.
//
// SECURITY: the database functions (migration 9) start with require_admin(),
// so they only answer ACTIVE admins. A client gets an error, never data.
// The pages also call requireAdmin() before loading anything.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type {
  AdminBookingDetails,
  AdminBookingListItem,
  AdminDashboardSummary,
  AdminRosterItem,
  AdminSession,
  BookingStatus,
} from "@/types/app";

// Loads the Dashboard numbers (today's seats, needs action, money).
// Takes: nothing.
// Gives back: one summary (see admin_dashboard_summary in migration 9).
// Throws if Supabase can't be reached or the caller isn't an admin.
export async function getDashboardSummary(): Promise<AdminDashboardSummary> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard_summary");
  if (error || !data[0]) {
    throw new Error(`Could not load the dashboard numbers: ${error?.message ?? "no row"}`);
  }
  return data[0];
}

// Loads the classes between two dates, past ones included.
// Takes: the first and last date, "YYYY-MM-DD" (Philippine dates).
// Gives back: the classes, earliest first, with seats taken / left and
// attendance still to mark. Throws if Supabase can't be reached.
export async function getAdminSessions(fromDate: string, toDate: string): Promise<AdminSession[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_sessions", {
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) {
    throw new Error(`Could not load the classes: ${error.message}`);
  }
  return data;
}

// Loads who is booked in one or more classes.
// Takes: a list of class ids (up to 50).
// Gives back: one row per guest, grouped by class (guests who are coming
// first). An empty list gives back nothing without asking the database.
// Throws if Supabase can't be reached.
export async function getClassRosters(sessionIds: string[]): Promise<AdminRosterItem[]> {
  if (sessionIds.length === 0) return [];
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_class_rosters", { p_session_ids: sessionIds });
  if (error) {
    throw new Error(`Could not load who is booked: ${error.message}`);
  }
  // The generated type says no column is ever empty; AdminRosterItem says
  // which ones can be (see src/types/app.ts).
  return data as AdminRosterItem[];
}

// The filters on the admin Bookings page.
export type AdminBookingFilters = {
  search?: string; // name, email, phone or booking code
  statuses?: BookingStatus[]; // empty = every status except expired
  date?: string; // "YYYY-MM-DD": only that class date
  startTime?: string; // "09:00": only classes starting then
  when: "upcoming" | "past" | "all"; // used when there's no date
  limit?: number; // default 200
};

// Loads the admin Bookings list.
// Takes: the filters above.
// Gives back: the matching bookings (at most `limit`), and how many matched
// in total. Throws if Supabase can't be reached.
export async function searchAdminBookings(
  filters: AdminBookingFilters,
): Promise<{ rows: AdminBookingListItem[]; totalMatches: number }> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_bookings", {
    p_search: filters.search || undefined,
    p_statuses: filters.statuses && filters.statuses.length > 0 ? filters.statuses : undefined,
    p_date: filters.date || undefined,
    p_start_time: filters.startTime || undefined,
    p_when: filters.when,
    p_limit: filters.limit ?? 200,
  });
  if (error) {
    throw new Error(`Could not load the bookings: ${error.message}`);
  }
  const rows = data as AdminBookingListItem[];
  return { rows, totalMatches: rows[0]?.total_matches ?? 0 };
}

// Loads one booking with its class, guest, transfers and payments.
// Takes: the booking id from the address.
// Gives back: the details, or null if the id is wrong or doesn't exist.
// Throws if Supabase can't be reached.
export async function getAdminBooking(bookingId: string): Promise<AdminBookingDetails | null> {
  if (!isUuid(bookingId)) return null;
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_booking", { p_booking_id: bookingId });
  if (error) {
    throw new Error(`Could not load the booking: ${error.message}`);
  }
  // "payments" arrives as a JSON list; AdminBookingDetails describes its shape
  return (data[0] as unknown as AdminBookingDetails | undefined) ?? null;
}

// Finds the date of one class (so the Attendance page can show the classes
// around it).
// Takes: the class id from the address.
// Gives back: its date "YYYY-MM-DD", or null if the id is wrong or the class
// doesn't exist. Throws if Supabase can't be reached.
export async function getSessionDate(sessionId: string): Promise<string | null> {
  if (!isUuid(sessionId)) return null;
  await io();
  const supabase = await createClient();
  // Everyone may read classes (RLS, migration 2); only the date is needed
  const { data, error } = await supabase.from("class_sessions").select("date").eq("id", sessionId).maybeSingle();
  if (error) {
    throw new Error(`Could not load the class: ${error.message}`);
  }
  return data?.date ?? null;
}
