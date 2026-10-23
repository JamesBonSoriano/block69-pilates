// The frame shared by every admin page (/admin/...).
// Where it's used: Next.js wraps each page in src/app/admin/(panel)/ with it.
// "(panel)" in brackets is a route group: it adds nothing to the web address
// (/admin/bookings stays /admin/bookings). It exists so the admin LOGIN page
// (src/app/admin/login/) sits outside this frame and its menus.
// Layout follows docs/designs/AdminBookings.html (laptop) and
// PhoneAdminDashboard.html (phone):
//   - laptop (1024px+): a 280px brown side menu on the left, the page on the
//     admin background (admin-bg) on the right
//   - phone: a 64px brown top bar with a menu button, the page, and a white
//     tab bar stuck to the bottom (Home, Bookings, Walk-in, Attendance)
// The menus and bars are left out when a page is printed (print:hidden), so
// the Attendance list prints on its own.
//
// Protection: src/proxy.ts sends guests to /admin/login and clients to Home before
// any admin page loads, and EVERY admin page calls requireAdmin() again on the
// server before showing anything. This frame shows only the admin's own
// name, so it doesn't need its own check.

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPhoneMenu } from "@/components/admin/AdminPhoneMenu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth/user";
import { getPublicSettings } from "@/lib/data/settings";
import { initialsOf } from "@/lib/format";

// Private pages: ask Google not to list them. Each page sets its own title.
export const metadata: Metadata = { robots: { index: false } };

// The admin frame.
// Takes: the page to show (children).
// Gives back: side menu (laptop) / top bar + bottom tabs (phone), and the page.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The cafe name (cached setting, the same for everyone)
  const settings = await getPublicSettings();

  return (
    // flex-1 fills the screen under <body>; bg-admin-bg covers the cream body color
    <div className="flex flex-1 bg-admin-bg">
      {/* Hidden until a keyboard user presses Tab: lets them jump past the menu */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cream focus:px-4 focus:py-3 focus:text-brown"
      >
        Skip to main content
      </a>

      {/* ===== Laptop: the brown side menu (sticky, full screen height) ===== */}
      <aside className="sticky top-0 hidden h-dvh w-70 shrink-0 flex-col gap-2 overflow-y-auto bg-brown px-5 py-7 lg:flex print:hidden">
        <AdminLogo cafeName={settings.cafeName} />
        <p className="px-3.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-tan">Admin menu</p>
        <AdminNav variant="sidebar" />

        {/* mt-auto pushes this to the bottom of the menu */}
        <div className="mt-auto flex flex-col gap-3 border-t border-brown-line pt-4">
          <Suspense fallback={<div className="h-10" />}>
            <AdminIdentity />
          </Suspense>
          <div className="flex gap-2">
            <ButtonLink href="/" variant="lightOutline" className="flex-1 px-3">
              View website
            </ButtonLink>
            <LogoutButton variant="light" formClassName="flex-1" fullWidth />
          </div>
        </div>
      </aside>

      {/* ===== The page (and the phone bars) ===== */}
      {/* min-w-0: lets wide tables scroll inside their own box instead of
          pushing the page sideways */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone: the brown top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 bg-brown px-4 lg:hidden print:hidden">
          <AdminLogo cafeName={settings.cafeName} compact />
          <Suspense fallback={null}>
            <AdminAvatar />
          </Suspense>
          <AdminPhoneMenu
            footer={
              <>
                <ButtonLink href="/" variant="lightOutline" fullWidth>
                  View website
                </ButtonLink>
                <LogoutButton variant="light" fullWidth />
              </>
            }
          />
        </header>

        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>

        {/* Phone: the white tab bar stuck to the bottom */}
        <AdminNav variant="tabs" />
      </div>
    </div>
  );
}

// The "69" circle with the cafe name and "ADMIN" under it.
// Takes: the cafe name, and compact = the smaller phone version.
// Gives back: a link to the Dashboard.
function AdminLogo({ cafeName, compact = false }: { cafeName: string; compact?: boolean }) {
  return (
    <Link
      href="/admin"
      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream lg:flex-none"
    >
      <span
        aria-hidden="true"
        className={
          compact
            ? "flex size-8.5 shrink-0 items-center justify-center rounded-full border border-caramel font-heading text-xs text-white"
            : "flex size-10 shrink-0 items-center justify-center rounded-full border border-caramel font-heading text-[13px] text-white"
        }
      >
        69
      </span>
      <span className="min-w-0">
        <span className={`block truncate font-heading font-semibold text-white ${compact ? "text-[15px]" : "text-lg"}`}>
          {cafeName}
        </span>
        <span className="block text-[10px] uppercase tracking-[0.1em] text-tan-soft">Admin</span>
      </span>
    </Link>
  );
}

// The logged-in admin's initials, name and role (bottom of the side menu).
// Takes: nothing (reads the login; the result is shared with the page's own
// requireAdmin() check during the same visit).
// Gives back: the avatar row, or nothing if nobody is logged in.
async function AdminIdentity() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-admin-active text-xs font-semibold text-brown"
      >
        {initialsOf(user.fullName, user.email)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-white">{user.fullName || user.email}</span>
        <span className="block text-[11px] text-tan-soft">Administrator</span>
      </span>
    </div>
  );
}

// The admin's initials in the phone top bar.
// Takes: nothing. Gives back: a small round avatar (with the name for screen
// readers), or nothing if nobody is logged in.
async function AdminAvatar() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin-active text-[11px] font-semibold text-brown">
      <span aria-hidden="true">{initialsOf(user.fullName, user.email)}</span>
      <span className="sr-only">Logged in as {user.fullName || user.email}</span>
    </span>
  );
}
