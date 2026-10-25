"use server";
// Server Actions for the admin SETUP pages (Step 11 part 2).
// Where it's used (through AdminActionForm, ConfirmActionButton and the
// other forms in src/components/admin/):
//   Settings + Pricing pages: saveSettings()
//   Pricing & Vouchers:       createPromo(), setPromoEnabled()
//   Payments (Needs review):  reviewPayment()
//   Schedule:                 saveTemplate(), addTemplate(), openNextWeeks(), updateClass()
//   Content:                  saveContent(), saveSiteImage(), removeSiteImage()
//   (Users moved to src/lib/admin/user-actions.ts in Version 1.4: no more
//   Deactivate or Make admin buttons; admins are set with SQL)
//
// "use server" = these run ONLY on our server. Each one:
//   1. reads and checks the form (friendly first checks),
//   2. checks AGAIN that the caller is an active admin (is_admin()),
//   3. saves through a database function (migration 10) or, for the weekly
//      schedule and page text, through the table itself, where Row Level
//      Security lets only admins change rows (migration 2),
//   4. clears the matching public cache with updateTag(), so Home, About
//      and the booking pages show the change straight away:
//        "settings"      prices, cutoff, contact details, links, drinks
//        "schedule"      the weekly pattern
//        "site-content"  page text and photos
//   5. calls refresh() so the admin page shows the saved values.
// Every answer has the AdminSaveState shape (src/lib/admin/form-state.ts).

import { refresh, updateTag } from "next/cache";
import { NOT_ADMIN, isAdmin, readText, type ServerClient } from "@/lib/admin/action-helpers";
import type { AdminSaveState } from "@/lib/admin/form-state";
import { friendlyDatabaseError } from "@/lib/database-errors";
import { SITE_IMAGES_BUCKET } from "@/lib/site-images";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { Json } from "@/types/database";

// ---------------------------------------------------------------------------
// SETTINGS and PRICING
// ---------------------------------------------------------------------------

// Which settings each page's form may save. Anything else in the form is
// ignored, so a changed form can't save a setting from another page.
// (The database checks every value again: admin_update_settings.)
const FORM_KEYS = {
  pricing: ["class_price", "mat_price", "hold_minutes", "cutoff_time"],
  settings: [
    "cafe_name",
    "cafe_address",
    "cafe_email",
    "cafe_phone",
    "maps_url",
    "instagram_url",
    "facebook_url",
    "chat_url",
    "admin_alert_email",
    "gcash_name",
    "gcash_number",
    "bpi_account_name",
    "bpi_account_number",
    "manual_payment_enabled",
    "drink_options",
  ],
} as const;

// Settings saved as numbers (pesos and minutes).
const NUMBER_KEYS = new Set(["class_price", "mat_price", "hold_minutes"]);

// Saves the settings of one page (Pricing or Settings) in one go.
// Takes: the previous state, and the form: form = "pricing" or "settings",
// plus one field per setting (named like the setting, e.g. class_price).
//   Numbers are sent as numbers; drink_options is a JSON list (from the
//   drink chips); manual_payment_enabled is a checkbox ("on" = on).
// Gives back: { saved } or { error }. Nothing is saved if ANY value is
// refused (the database saves them all together, or none).
export async function saveSettings(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const form = readText(formData, "form");
  if (form !== "pricing" && form !== "settings") {
    return { error: "Sorry, we don't know which settings to save." };
  }

  const values: Record<string, Json> = {};
  for (const key of FORM_KEYS[form]) {
    const text = readText(formData, key);
    if (NUMBER_KEYS.has(key)) {
      // A real number is sent as a number. Anything else (empty, "abc") is
      // sent as typed, so the database answers with its clear message.
      values[key] = text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
    } else if (key === "manual_payment_enabled") {
      // A ticked checkbox sends "on"; an unticked one sends nothing
      values[key] = formData.get(key) === "on";
    } else if (key === "drink_options") {
      values[key] = readJsonList(text);
    } else {
      values[key] = text;
    }
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_update_settings", { p_values: values });
  if (error) return { error: friendlyDatabaseError(error) };

  // Clear the cached public settings (header, footer, prices, booking pages)
  updateTag("settings");
  refresh();
  return done(form === "pricing" ? "Prices and booking rules saved. They apply to new bookings from now on." : "Settings saved.");
}

// ---------------------------------------------------------------------------
// PROMO CODES
// ---------------------------------------------------------------------------

// Makes a new promo code.
// Takes: the previous state, and the form: code, percent_off, uses, and
// expires_on ("YYYY-MM-DD" or empty = no last day).
// Gives back: { saved } or { error }. The database checks everything
// (code format, HALF- codes kept for the system, 0-100%, uses, date).
export async function createPromo(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const code = readText(formData, "code").toUpperCase();
  const percent = Number(readText(formData, "percent_off"));
  const uses = Number(readText(formData, "uses"));
  const expiresOn = readText(formData, "expires_on");

  if (!code) return { error: "Please type a code, for example FIRSTMAT20." };
  if (!Number.isFinite(percent)) return { error: "Please type the percent off, for example 20." };
  if (!Number.isInteger(uses)) return { error: "Please type how many times it can be used, for example 30." };
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: "Please pick a valid last day." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_create_promo", {
    p_code: code,
    p_percent_off: percent,
    p_uses: uses,
    p_expires_on: expiresOn || undefined,
  });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  return done(`Code ${code} created. Clients can use it from now on.`);
}

// Turns a promo code off (nobody can use it any more) or back on.
// Takes: the previous state, and the form: voucher_id, enabled ("true" / "false").
// Gives back: { saved } or { error }. Bookings that already hold a seat with
// the code keep their discount.
export async function setPromoEnabled(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const voucherId = readText(formData, "voucher_id");
  const enabled = readText(formData, "enabled");
  if (!isUuid(voucherId) || (enabled !== "true" && enabled !== "false")) {
    return { error: "Sorry, we couldn't find that code." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_set_promo_enabled", {
    p_voucher_id: voucherId,
    p_enabled: enabled === "true",
  });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  return done(enabled === "true" ? "Code turned back on." : "Code turned off.");
}

// ---------------------------------------------------------------------------
// PAYMENTS: approve or reject a manual GCash / BPI transfer
// ---------------------------------------------------------------------------

// Approves or rejects one manual transfer after looking at its screenshot.
// Takes: the previous state, and the form: payment_id, decision
// ("approve" or "reject").
// Gives back: { saved } or { error }.
// admin_review_manual_payment (migration 3): approve = payment paid +
// booking confirmed (the seat was held for it); reject = payment rejected +
// booking expired (the seat is freed).
export async function reviewPayment(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const paymentId = readText(formData, "payment_id");
  const decision = readText(formData, "decision");
  if (!isUuid(paymentId)) return { error: "Sorry, we couldn't find that payment." };
  if (decision !== "approve" && decision !== "reject") return { error: "Please choose approve or reject." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_review_manual_payment", {
    p_payment_id: paymentId,
    p_approve: decision === "approve",
  });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  return done(
    decision === "approve"
      ? "Approved. The booking is confirmed."
      : "Rejected. The seat is free again. Please message the client.",
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE: the weekly pattern and one dated class
// ---------------------------------------------------------------------------

// Saves changes to one weekly slot (day, times, seats, on / off).
// Takes: the previous state, and the form: template_id, weekday (0-6),
// start_time and end_time ("HH:MM"), capacity, is_active ("on" = on).
// Gives back: { saved } or { error }.
// Only FUTURE classes made with "Open the next 9 weeks" use the new values. Classes
// that already have a date are NOT changed (change those one by one below).
export async function saveTemplate(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const templateId = readText(formData, "template_id");
  if (!isUuid(templateId)) return { error: "Sorry, we couldn't find that class time." };
  const slot = readTemplate(formData);
  if ("error" in slot) return slot;

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // RLS: only admins may change templates (migration 2). select("id") tells
  // us if a row was really changed.
  const { data, error } = await supabase.from("schedule_templates").update(slot).eq("id", templateId).select("id");
  if (error) return { error: templateError(error) };
  if (data.length === 0) return { error: "Sorry, we couldn't find that class time." };

  // Home and About Us show the weekly pattern (cached)
  updateTag("schedule");
  refresh();
  return done("Class time saved. New classes made from now on will use it.");
}

// Adds a new weekly slot.
// Takes: the previous state, and the same fields as saveTemplate (no id).
// Gives back: { saved } or { error } (e.g. that day and time already exist).
export async function addTemplate(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const slot = readTemplate(formData);
  if ("error" in slot) return slot;

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.from("schedule_templates").insert(slot);
  if (error) return { error: templateError(error) };

  updateTag("schedule");
  refresh();
  return done("Class time added. Press \"Open the next 9 weeks\" to add its dated classes.");
}

// How many weeks of dated classes "Open the next 9 weeks" makes: enough to
// cover all of next month, which clients can book (Change 17).
const WEEKS_AHEAD = 9;

// "Open the next 9 weeks" (Schedule > Open classes for booking): makes the
// dated classes from the weekly pattern, from today up to 9 weeks ahead.
// Classes that already exist are skipped (not changed).
// Takes: nothing (the form's previous state and empty form are ignored), so
// the number of weeks can't be changed from the browser.
// Gives back: { saved } saying how many new classes were made, or { error }.
export async function openNextWeeks(): Promise<AdminSaveState> {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // generate_sessions (migration 3) checks is_admin() itself too, and gives
  // back how many NEW classes it made
  const { data, error } = await supabase.rpc("generate_sessions", { p_weeks: WEEKS_AHEAD });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  const made = data ?? 0;
  return done(
    made === 0
      ? `No new classes: the next ${WEEKS_AHEAD} weeks are already open.`
      : `${made} new class${made === 1 ? "" : "es"} made. Clients can book them now.`,
  );
}

// Changes ONE dated class: its seats, or open / closed for booking.
// Takes: the previous state, and the form: session_id, capacity, status
// ("open" or "closed").
// Gives back: { saved } or { error }. The database never lets the seats go
// below the seats already taken, and locks the class while it changes it.
export async function updateClass(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const sessionId = readText(formData, "session_id");
  const capacity = Number(readText(formData, "capacity"));
  const status = readText(formData, "status");
  if (!isUuid(sessionId)) return { error: "Sorry, we couldn't find that class." };
  if (!Number.isInteger(capacity)) return { error: "Please type the number of seats." };
  if (status !== "open" && status !== "closed") return { error: "Please choose open or closed." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const { error } = await supabase.rpc("admin_update_session", {
    p_session_id: sessionId,
    p_capacity: capacity,
    p_status: status,
  });
  if (error) return { error: friendlyDatabaseError(error) };

  refresh();
  return done(status === "closed" ? `Saved: ${capacity} seats, closed for booking.` : `Saved: ${capacity} seats, open.`);
}

// ---------------------------------------------------------------------------
// CONTENT: page text and photos
// ---------------------------------------------------------------------------

// The longest title and text one block may have.
const MAX_TITLE = 200;
const MAX_BODY = 6000;

// Saves the title and text of one page block.
// Takes: the previous state, and the form: content_id, title, body.
// Gives back: { saved } or { error }.
// Fill-in words like {class_price} are saved as they are; the pages swap
// them for the current setting when they are shown.
export async function saveContent(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const contentId = readText(formData, "content_id");
  const title = readText(formData, "title");
  // Keep the admin's line breaks (they make list items), only trim the ends,
  // and save Windows line endings as plain ones
  const body = readText(formData, "body").replace(/\r\n/g, "\n");
  if (!isUuid(contentId)) return { error: "Sorry, we couldn't find that block." };
  if (title.length > MAX_TITLE) return { error: `Please keep the title to ${MAX_TITLE} characters or less.` };
  if (body.length > MAX_BODY) return { error: `Please keep the text to ${MAX_BODY} characters or less.` };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  // RLS: only admins may change site_content (migration 2)
  const { data, error } = await supabase
    .from("site_content")
    .update({ title: title || null, body: body || null })
    .eq("id", contentId)
    .select("id");
  if (error) return { error: friendlyDatabaseError(error) };
  if (data.length === 0) return { error: "Sorry, we couldn't find that block." };

  // Home, About Us, Policies and the booking pages read page text (cached)
  updateTag("site-content");
  refresh();
  return done("Saved. The website shows the new text now.");
}

// Saves a photo that the browser has just uploaded to the "site-images"
// bucket, and removes the photo it replaces.
// Takes: the previous state, and the form: content_id, path (the new file,
// e.g. "home/hero-1729651234567.jpg").
// Gives back: { saved } or { error }.
// The upload itself happens in the browser (SiteImageUpload.tsx) with the
// admin's own login: the bucket's policies only let active admins upload.
// Server Actions only take 1 MB, which is too small for photos.
export async function saveSiteImage(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const contentId = readText(formData, "content_id");
  const path = readText(formData, "path");
  if (!isUuid(contentId)) return { error: "Sorry, we couldn't find that photo spot." };
  // Only the file names SiteImageUpload makes: "<page>/<section>-<number>.<ext>"
  if (!/^[a-z_]+\/[a-z0-9_]+-\d+\.(jpg|png|webp)$/.test(path)) {
    return { error: "Sorry, that photo couldn't be saved. Please upload it again." };
  }

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const old = await readImagePath(supabase, contentId);
  if (old === undefined) return { error: "Sorry, we couldn't find that photo spot." };

  const { error } = await supabase.from("site_content").update({ image_path: path }).eq("id", contentId);
  if (error) return { error: friendlyDatabaseError(error) };

  // The old photo isn't needed any more (only bucket files, never public/ files)
  if (old && old !== path) await deleteBucketFile(supabase, old);

  updateTag("site-content");
  refresh();
  return done("Photo saved. The website shows it now.");
}

// Removes the photo from one photo spot (the page shows the brown box again).
// Takes: the previous state, and the form: content_id.
// Gives back: { saved } or { error }.
export async function removeSiteImage(_previous: AdminSaveState, formData: FormData): Promise<AdminSaveState> {
  const contentId = readText(formData, "content_id");
  if (!isUuid(contentId)) return { error: "Sorry, we couldn't find that photo spot." };

  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: NOT_ADMIN };

  const old = await readImagePath(supabase, contentId);
  if (old === undefined) return { error: "Sorry, we couldn't find that photo spot." };

  const { error } = await supabase.from("site_content").update({ image_path: null }).eq("id", contentId);
  if (error) return { error: friendlyDatabaseError(error) };
  if (old) await deleteBucketFile(supabase, old);

  updateTag("site-content");
  refresh();
  return done("Photo removed.");
}

// ---------------------------------------------------------------------------
// Small helpers (not exported, so the browser can't call them)
// ---------------------------------------------------------------------------

// Makes a "saved" answer.
// Takes: the message. Gives back: the state, with the time it was made.
function done(message: string): AdminSaveState {
  return { saved: message, savedAt: Date.now() };
}

// Reads a JSON list of text (the drink chips send one).
// Takes: the text. Gives back: the list, or [] if it isn't a list of text
// (then the database says "Please keep between 1 and 12 drinks").
function readJsonList(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// The columns of one weekly slot, as saved in schedule_templates.
type TemplateValues = {
  weekday: number;
  start_time: string;
  end_time: string;
  default_capacity: number;
  is_active: boolean;
};

// Reads and checks the fields of one weekly slot.
// Takes: the form. Gives back: the values to save, or { error }.
function readTemplate(formData: FormData): TemplateValues | { error: string } {
  const weekday = Number(readText(formData, "weekday"));
  const start = readText(formData, "start_time").slice(0, 5);
  const end = readText(formData, "end_time").slice(0, 5);
  const capacity = Number(readText(formData, "capacity"));
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "Please pick a day." };
  if (!time.test(start) || !time.test(end)) return { error: "Please type the start and end times." };
  // "09:50" > "09:00" works as text because both are HH:MM
  if (end <= start) return { error: "The class must end after it starts." };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return { error: "Seats must be between 1 and 50." };

  return {
    weekday,
    start_time: start,
    end_time: end,
    default_capacity: capacity,
    is_active: formData.get("is_active") === "on",
  };
}

// Turns a schedule_templates error into a message.
// Takes: the error. Gives back: plain words (23505 = "already exists").
function templateError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "There is already a class on that day at that start time.";
  return friendlyDatabaseError(error);
}

// Reads the photo path saved on one page block.
// Takes: a Supabase client and the block id.
// Gives back: the path ("" if none), or undefined if the block doesn't exist.
async function readImagePath(supabase: ServerClient, contentId: string): Promise<string | undefined> {
  const { data, error } = await supabase.from("site_content").select("image_path").eq("id", contentId).maybeSingle();
  if (error) {
    console.error("Could not read the photo spot:", error.message);
    return undefined;
  }
  return data ? (data.image_path ?? "") : undefined;
}

// Deletes one file from the "site-images" bucket.
// Takes: a Supabase client and the saved path.
// Gives back: nothing. Paths starting with "/" are files in public/ (not in
// the bucket) and are left alone. A failed delete is only logged: the photo
// spot is already updated, and an extra old file does no harm.
async function deleteBucketFile(supabase: ServerClient, path: string): Promise<void> {
  if (path.startsWith("/") || path.includes("..")) return;
  const { error } = await supabase.storage.from(SITE_IMAGES_BUCKET).remove([path]);
  if (error) console.error("Could not delete the old photo:", error.message);
}
