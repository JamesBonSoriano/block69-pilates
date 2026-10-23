// Reads what the admin SETUP pages show (Step 11 part 2): payments and
// earnings, vouchers, accounts, every setting (the admin-only ones too), the
// weekly schedule, all page text, what the admin may do with one booking,
// and short-lived links to payment screenshots.
// Where it's used: the pages in src/app/admin/ (Payments, Pricing & Vouchers,
// Schedule, Settings, Content, Users) and the booking details page.
//
// NO CACHING, on purpose: the admin must always see the real values, right
// after saving. (The public pages read settings / page text / the schedule
// through the CACHED readers in settings.ts, content.ts and schedule.ts; the
// Server Actions clear those caches with updateTag when the admin saves.)
// Every function calls `await io()` before createClient() (the Step 7 rule,
// see src/lib/supabase/server.ts), so pages must show them inside <Suspense>.
//
// SECURITY: the admin_* database functions (migration 10) start with
// require_admin(). The tables read directly here (settings, schedule
// templates, site_content) only give admins the private rows (RLS,
// migration 2). The pages also call requireAdmin() before loading anything.

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type {
  AdminBillingSummary,
  AdminBookingChangeInfo,
  AdminEarningRow,
  AdminPayment,
  AdminUser,
  AdminVoucher,
  ScheduleTemplate,
  SiteContentRow,
} from "@/types/app";
import type { Json } from "@/types/database";

// The private bucket that holds manual transfer screenshots (migration 10).
const SCREENSHOT_BUCKET = "payment-screenshots";

// The filters on the Payments page.
export type AdminPaymentFilters = {
  view: "all" | "review" | "late"; // the tab
  status?: string; // one payment status, e.g. "paid"
  method?: string; // one method, e.g. "gcash"
  from?: string; // "YYYY-MM-DD" (Philippine date)
  to?: string;
  search?: string; // client name, email, PayMongo reference, booking code
  limit?: number; // default 200
};

// Loads the payments for the Payments page.
// Takes: the filters above.
// Gives back: the payments (at most `limit`) and how many matched in total.
// Throws if Supabase can't be reached or a filter is refused.
export async function getAdminPayments(
  filters: AdminPaymentFilters,
): Promise<{ rows: AdminPayment[]; totalMatches: number }> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_payments", {
    p_view: filters.view,
    p_status: filters.status || undefined,
    p_method: filters.method || undefined,
    p_from: filters.from || undefined,
    p_to: filters.to || undefined,
    p_search: filters.search || undefined,
    p_limit: filters.limit ?? 200,
  });
  if (error) {
    throw new Error(`Could not load the payments: ${error.message}`);
  }
  const rows = data as AdminPayment[];
  return { rows, totalMatches: rows[0]?.total_matches ?? 0 };
}

// Loads the money received between two dates, by day and method.
// Takes: the first and last date, "YYYY-MM-DD" (at most 400 days apart).
// Gives back: one row per day + method that had paid payments.
// Throws if Supabase can't be reached.
export async function getEarnings(fromDate: string, toDate: string): Promise<AdminEarningRow[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_earnings", { p_from: fromDate, p_to: toDate });
  if (error) {
    throw new Error(`Could not load the earnings: ${error.message}`);
  }
  return data;
}

// Loads the money totals for the top of the Payments page (Step 12).
// Takes: nothing.
// Gives back: paid today / this week / this month (Philippine time, paid
// money only), mat rental donations this month and all time, and the counts
// of "paid, needs action" bookings and transfers to check.
// admin_billing_summary() (migration 11) works it all out in the database
// and refuses anyone who isn't an active admin. Throws if it can't load.
export async function getBillingSummary(): Promise<AdminBillingSummary> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_billing_summary");
  if (error || !data[0]) {
    throw new Error(`Could not load the billing totals: ${error?.message ?? "no answer"}`);
  }
  return data[0];
}

// Loads every voucher: the promo codes and the personal 50% codes.
// Takes: nothing.
// Gives back: the vouchers, newest first. Throws if Supabase can't be reached.
export async function getAdminVouchers(): Promise<AdminVoucher[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_vouchers");
  if (error) {
    throw new Error(`Could not load the vouchers: ${error.message}`);
  }
  return data as AdminVoucher[];
}

// Loads the accounts for the Users page.
// Takes: search text (name, email or mobile; "" = everyone) and a role
// ("client", "admin" or "" for everyone).
// Gives back: the accounts (at most 200), by name, and the total count.
// Throws if Supabase can't be reached.
export async function getAdminUsers(
  search: string,
  role: "" | "client" | "admin",
): Promise<{ rows: AdminUser[]; totalMatches: number }> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: search || undefined,
    p_role: role || undefined,
    p_limit: 200,
  });
  if (error) {
    throw new Error(`Could not load the accounts: ${error.message}`);
  }
  const rows = data as AdminUser[];
  return { rows, totalMatches: rows[0]?.total_matches ?? 0 };
}

// Loads EVERY setting, the admin-only ones too (e.g. admin_alert_email).
// Takes: nothing.
// Gives back: a lookup from key to value, e.g. { class_price: 500, ... }.
// Throws if Supabase can't be reached.
export async function getAllSettings(): Promise<Record<string, Json>> {
  await io();
  const supabase = await createClient();
  // Admins may read every row (RLS policy "Anyone reads public settings,
  // admins read all", migration 2)
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) {
    throw new Error(`Could not load the settings: ${error.message}`);
  }
  return Object.fromEntries(data.map((row) => [row.key, row.value]));
}

// Loads the weekly class pattern, switched-off slots too.
// Takes: nothing.
// Gives back: every template, Monday first, then by start time.
// Throws if Supabase can't be reached.
export async function getScheduleTemplates(): Promise<ScheduleTemplate[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.from("schedule_templates").select("*").order("start_time");
  if (error) {
    throw new Error(`Could not load the weekly schedule: ${error.message}`);
  }
  // Monday first: (weekday + 6) % 7 turns Mon..Sun into 0..6
  return data.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time));
}

// Loads every editable block of page text.
// Takes: nothing.
// Gives back: all site_content rows, by page and section.
// Throws if Supabase can't be reached.
export async function getAllSiteContent(): Promise<SiteContentRow[]> {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_content").select("*").order("page").order("section");
  if (error) {
    throw new Error(`Could not load the page text: ${error.message}`);
  }
  return data;
}

// Loads what the admin may do with one booking right now (Cancel /
// Transfer), and the admin changes already made to it.
// Takes: the booking id.
// Gives back: the info, or null if the id is wrong or doesn't exist.
// Throws if Supabase can't be reached.
export async function getBookingChangeInfo(bookingId: string): Promise<AdminBookingChangeInfo | null> {
  if (!isUuid(bookingId)) return null;
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_booking_change_info", { p_booking_id: bookingId });
  if (error) {
    throw new Error(`Could not load what can be changed: ${error.message}`);
  }
  // "actions" arrives as a JSON list; AdminBookingChangeInfo describes it
  return (data[0] as unknown as AdminBookingChangeInfo | undefined) ?? null;
}

// Makes short-lived links to payment screenshots, so the admin can see them.
// The bucket is PRIVATE: only an active admin's login may open its files
// (policy "Admins read payment screenshots", migration 10), and each link
// stops working after 10 minutes.
// Takes: the screenshot paths saved on the payments.
// Gives back: a lookup from path to link (missing = the file couldn't be found).
export async function getScreenshotLinks(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrls(paths, 600);
  if (error) {
    // Not fatal: the page still works, it just says the picture is missing
    console.error("Could not make screenshot links:", error.message);
    return {};
  }
  const links: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) links[item.path] = item.signedUrl;
  }
  return links;
}
