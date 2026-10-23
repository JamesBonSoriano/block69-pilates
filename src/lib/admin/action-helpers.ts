// Small helpers shared by the admin Server Actions
// (src/lib/admin/actions.ts and src/lib/admin/setup-actions.ts).
// Where it's used: only those two files (server code).
//
// They live in their own file, not inside a "use server" file, because
// EVERY function exported from a "use server" file can be called from the
// browser. These helpers must never be callable on their own.

import "server-only"; // never sent to the browser
import type { createClient } from "@/lib/supabase/server";

// Shown when the caller isn't (or is no longer) an active admin.
export const NOT_ADMIN = "Only admins can do this. Please log in again with an admin account.";

// A logged-in Supabase client (what createClient() gives back).
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Asks the database if the caller is an active admin (is_admin(), migration 2).
// Takes: a Supabase client. Gives back: true only for an active admin.
// (A logged-out caller or a client gets false.)
export async function isAdmin(supabase: ServerClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

// Reads a text field from a form and trims spaces from both ends.
// Takes: the form data and the field name.
// Gives back: the text, or "" if it's missing.
export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
