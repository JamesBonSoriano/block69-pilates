// Finds out who is logged in, and guards private pages ON THE SERVER.
// Where it's used: the Header (to show Log in or Log out), the My Account
// pages (requireUser) and the admin pages (requireAdmin).
//
// src/proxy.ts already checks the login before a page loads. These checks
// run AGAIN inside each private page, so a page stays protected even if the
// proxy is skipped or changed by mistake. Never rely on hiding buttons.
//
// Because these read the login cookies, a page must call them inside a
// <Suspense> section (see src/app/(client)/account/page.tsx).

import "server-only"; // never sent to the browser
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// The logged-in person, with the profile details pages need.
export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  mobile: string | null;
  instagram: string | null; // optional handle, pre-filled in booking step 2
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
    .select("email, full_name, mobile, instagram, role, is_active")
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
    role: profile?.role ?? "client",
    // No profile row at all is treated like a deactivated account (safe default)
    isActive: profile?.is_active ?? false,
  };
});

// Use at the top of every page that needs a logged-in, active user.
// Takes: the path of the page (so we can come back to it after logging in).
// Gives back: the CurrentUser. If nobody is logged in, it sends them to
// /login?next=<path>. If the account is deactivated, it sends them to
// /auth/deactivated, which logs them out with a message.
export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!user.isActive) {
    redirect("/auth/deactivated");
  }
  return user;
}

// Use at the top of every admin page.
// Takes: nothing.
// Gives back: the CurrentUser, but only if the database's is_admin() says
// they're an active admin. A client is sent to the Home page instead (not an
// error page). Guests go to the login page first.
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
