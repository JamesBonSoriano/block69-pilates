// Finds out who is logged in, and guards private pages ON THE SERVER.
// Where it's used: the Header (to show Log in or Log out), the booking and
// My Account pages (requireClient) and the admin pages (requireAdmin).
//
// src/proxy.ts already checks the login before a page loads. These checks
// run AGAIN inside each private page, so a page stays protected even if the
// proxy is skipped or changed by mistake. Never rely on hiding buttons.
//
// Because these read the login cookies, a page must call them inside a
// <Suspense> section (see src/app/(client)/account/page.tsx).

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { loginPathFor } from "@/lib/auth/login-portal";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// The logged-in person, with the profile details pages need.
export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  mobile: string | null;
  instagram: string | null; // optional handle, shown in booking step 2
  birthday: string | null; // "YYYY-MM-DD"; null = not given yet (asked once)
  role: Database["public"]["Enums"]["user_role"]; // "client" or "admin"
  isActive: boolean; // false = deactivated
};

// Gets the logged-in person (or null for a guest).
// Takes: nothing (it reads the login cookies).
// Gives back: a CurrentUser, or null if nobody is logged in. Throws if the
// database can't be reached.
//
// cache() = if the Header and the page both ask during the same visit,
// Supabase is only asked once. (It's per visit, never shared between people.)
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // io() = "real work happens after this line". The Supabase client reads
  // the clock (Date.now()) to see if the saved login has run out: as soon as
  // it's created (it loads the login from the cookies straight away), and
  // again in getClaims(). Next.js prepares pages ahead of time (including a
  // per-visitor "App Shell" for fast clicks), and a clock reading must never
  // be frozen into those. While preparing, io() simply waits forever, so the
  // <Suspense> fallback is used instead. On a real visit it carries on at once.
  // So io() MUST come before createClient().
  await io();

  const supabase = await createClient();

  // getClaims() checks the login token's signature, so a fake or edited
  // cookie is rejected. (Never trust getSession() on the server: it doesn't check.)
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  // Read their profile. Row Level Security only lets them read their own row.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email, full_name, mobile, instagram, birthday, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load your profile: ${error.message}`);
  }

  return {
    id: claims.sub,
    email: profile?.email || claims.email || "",
    fullName: profile?.full_name ?? "",
    mobile: profile?.mobile ?? null,
    instagram: profile?.instagram ?? null,
    birthday: profile?.birthday ?? null,
    role: profile?.role ?? "client",
    // No profile row at all is treated like a deactivated account (safe default)
    isActive: profile?.is_active ?? false,
  };
});

// Use at the top of every page that needs a logged-in, active user.
// Takes: the path of the page (so we can come back to it after logging in).
// Gives back: the CurrentUser. If nobody is logged in, it sends them to the
// right login page with ?next=<path> (/admin/login for admin pages, /login
// for the rest). If the account is deactivated, it sends them to
// /auth/deactivated, which logs them out with a message.
export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${loginPathFor(nextPath)}?next=${encodeURIComponent(nextPath)}`);
  }
  if (!user.isActive) {
    redirect("/auth/deactivated");
  }
  return user;
}

// The one-time "add your birthday" page (Revisions part 1, item 7).
export const BIRTHDAY_PATH = "/account/birthday";

// Use at the top of every CLIENT-only page (booking steps, My Account).
// Takes: the path of the page (for coming back after logging in, or after
// adding a birthday).
// Gives back: the CurrentUser, but only for a client. Otherwise it sends
// them somewhere else:
//   - guests and deactivated accounts: see requireUser()
//   - an admin: to the admin Dashboard (admins don't book or use My Account;
//     Revisions part 1, item 1)
//   - a client with no birthday yet (accounts made before it was required):
//     to /account/birthday?next=<path>, ONCE. After saving it they come back.
export async function requireClient(nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  // requireUser() has already checked the account is active, so an active
  // account with role "admin" is exactly what is_admin() means
  if (user.role === "admin") {
    redirect("/admin");
  }
  // The birthday page itself must not send people to itself
  if (!user.birthday && !nextPath.startsWith(BIRTHDAY_PATH)) {
    redirect(`${BIRTHDAY_PATH}?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

// Use on a PUBLIC page that admins still shouldn't use (booking step 1,
// /book, which guests may open). Must be called inside <Suspense>.
// Takes: nothing.
// Gives back: nothing for guests and clients. A logged-in admin is sent to
// the admin Dashboard. If the database can't be reached, the visitor is
// treated as a guest (every later booking step checks again with
// requireClient(), and the proxy checks first anyway).
export async function sendAdminsAway(): Promise<void> {
  let user: CurrentUser | null = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Pass on Next.js's own internal signals, and the dev-mode AbortError
    // (see the class list code in src/app/(client)/book/page.tsx)
    unstable_rethrow(error);
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error);
  }
  if (user?.isActive && user.role === "admin") {
    redirect("/admin");
  }
}

// Use at the top of every admin page.
// Takes: nothing.
// Gives back: the CurrentUser, but only if the database's is_admin() says
// they're an active admin. A client is sent to the Home page instead (not an
// error page). Guests go to the admin login page (/admin/login) first.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");

  // Ask the database, so the rule lives in one place (migration 2, is_admin())
  const supabase = await createClient();
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) {
    throw new Error(`Could not check admin access: ${error.message}`);
  }
  if (isAdmin !== true) {
    redirect("/");
  }
  return user;
}
