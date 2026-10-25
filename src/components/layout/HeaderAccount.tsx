// The parts of the client Header that depend on WHO is logged in:
//   - laptop:     "Log in" (or "Book Now" on the login pages), or for a
//                 client the bell + the person icon
//   - phone bar:  the bell + the person icon next to the menu button
//   - phone menu: name + email + My Account links at the top, and
//                 Log in at the bottom (guests only)
// Log out is on My Profile (Version 1.4), not in the header.
// The person icon (Revisions part 1, item 6) is the "My Account" link: it
// opens My Profile. The bell (Change 17, NotificationBell.tsx) holds the
// booking updates and the unread count (it used to be a dot on the person icon).
// There is NO "Admin" link here (Revisions part 1, item 1): staff use
// /admin/login. An admin who browses the public pages can tap their initials
// to get back to the admin Dashboard; they don't get the My Account links,
// because admins can't use those pages (src/proxy.ts).
// Where it's used: src/components/layout/Header.tsx, which puts EACH of these
// inside its own <Suspense>. The rest of the header (logo, links, menu button)
// stays static, so it shows at once and never waits for the login check.
//
// These are Server Components: they read the login cookies on the server.

import { UserRound } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { cn } from "@/lib/cn";
import { getCurrentUser } from "@/lib/auth/user";
import { getMyUnreadCount } from "@/lib/data/notifications";
import { initialsOf } from "@/lib/format";
import { GuestHeaderButton } from "./GuestHeaderButton";
import { accountHomeHref, accountNavLinks, adminHomeHref } from "./nav-links";
import { NotificationBell } from "./NotificationBell";

// What the header shows about the logged-in person.
type HeaderUser = {
  name: string; // full name ("" if they haven't given one)
  email: string;
  initials: string; // e.g. "JS", for the admin's round avatar
  isAdmin: boolean; // admin = initials link to the Dashboard (display only; pages check again)
  unread: number; // unread notifications (clients only; 0 for admins)
};

// Gets the few details the header shows about the logged-in person.
// Takes: nothing (reads the login cookies through getCurrentUser, which is
// shared).
// Gives back: a HeaderUser, or null for a guest. If the database can't be
// reached, the header just shows "Log in" instead of breaking the page.
// cache() = the four header parts share ONE answer per visit, so the unread
// count is only asked for once.
const loadHeaderUser = cache(async (): Promise<HeaderUser | null> => {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    // Only decides what the header shows. Admin pages check is_admin() themselves.
    const isAdmin = user.role === "admin" && user.isActive;
    return {
      name: user.fullName,
      email: user.email,
      initials: initialsOf(user.fullName, user.email),
      isAdmin,
      // Admins have no Notifications page, so they never get a dot
      unread: isAdmin ? 0 : await getMyUnreadCount(),
    };
  } catch (error) {
    // Pass on Next.js's own internal signals (see the class list code in
    // src/app/(client)/book/page.tsx)
    unstable_rethrow(error);
    // Dev-mode "practice render" being stopped early: pass it on quietly
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error); // a real problem: show it in the terminal
    return null;
  }
});

// The round person icon that opens My Account (My Profile).
// For an admin: their initials, linking to /admin.
// Takes: the header user, and size = "lg" (laptop) or "sm" (phone bar).
// Gives back: the link. The tap area is always 44px; on phones the visible
// circle inside it is a little smaller.
function AccountIcon({ user, size }: { user: HeaderUser; size: "lg" | "sm" }) {
  // The link itself: a 44px round tap area
  const tapArea =
    "flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream";
  // The visible Light Sage circle inside it
  const circle = cn(
    "relative flex items-center justify-center rounded-full bg-sage-light font-semibold text-primary",
    size === "lg" ? "size-11 text-xs" : "size-9 text-[11px]",
  );

  if (user.isAdmin) {
    return (
      <Link href={adminHomeHref} title={`${user.name || user.email}: admin dashboard`} className={tapArea}>
        <span aria-hidden="true" className={circle}>
          {user.initials}
        </span>
        <span className="sr-only">Admin dashboard (logged in as {user.name || user.email})</span>
      </Link>
    );
  }

  return (
    <Link href={accountHomeHref} aria-label="My Account" title="My Account" className={tapArea}>
      <span aria-hidden="true" className={circle}>
        <UserRound className={size === "lg" ? "size-5" : "size-4.5"} />
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// LAPTOP (1024px and wider)
// ---------------------------------------------------------------------------

// The right-hand end of the laptop header.
// Takes: nothing. Gives back: "Log in" (or "Book Now" on the login pages) for
// guests; for clients the bell and the person icon (My Account); for admins
// their initials (to /admin, where their Log out button is).
export async function DesktopAccount() {
  const user = await loadHeaderUser();

  if (!user) return <GuestHeaderButton />;

  return (
    <div className="flex items-center gap-2">
      {/* key: a new unread count from the server starts the bell afresh */}
      {!user.isAdmin && <NotificationBell key={user.unread} initialUnread={user.unread} size="lg" />}
      <AccountIcon user={user} size="lg" />
    </div>
  );
}

// Shown in that spot while the login check runs: an empty space the size of
// the "Log in" button, so nothing jumps and "Log in" never flashes up for
// someone who is logged in.
export function DesktopAccountFallback() {
  return <span aria-hidden="true" className="block h-11 w-24" />;
}

// ---------------------------------------------------------------------------
// PHONE (under 1024px)
// ---------------------------------------------------------------------------

// The bell and the person icon next to the phone menu button (PhoneMenu.html
// had initials).
// Takes: nothing. Gives back: the bell (clients only) and the icon link, or
// nothing for guests.
export async function PhoneAvatar() {
  const user = await loadHeaderUser();
  if (!user) return null;
  return (
    <>
      {!user.isAdmin && <NotificationBell key={user.unread} initialUnread={user.unread} size="sm" />}
      <AccountIcon user={user} size="sm" />
    </>
  );
}

// The top of the phone menu: who is logged in (PhoneMenu.html), and quick
// links to their My Account pages (Profile, Bookings, Payments, ...).
// Takes: nothing. Gives back: avatar + name + email + account links, or
// nothing for guests (they'd only be sent to the login page). Admins get no
// account links (they can't use those pages); a small "Admin dashboard"
// link under their email takes them back instead.
export async function PhoneMenuUser() {
  const user = await loadHeaderUser();
  if (!user) return null;
  return (
    <div className="mb-1 flex flex-col gap-4 border-b border-white/25 pb-5 pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sage-light font-semibold text-primary"
        >
          {user.isAdmin ? user.initials : <UserRound className="size-5" />}
        </span>
        {/* min-w-0 + break-all: a long email wraps instead of overflowing */}
        <div className="min-w-0">
          {user.name && <p className="font-semibold text-white">{user.name}</p>}
          <p className="break-all text-xs text-cream">{user.email}</p>
          {user.isAdmin && (
            <Link
              href={adminHomeHref}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-cream underline underline-offset-4"
            >
              Admin dashboard
            </Link>
          )}
        </div>
      </div>
      {/* My Account pages as small pills that wrap onto more lines (clients
          only). The unread count is on the bell in the top bar now. */}
      {!user.isAdmin && (
        <ul aria-label="My Account" className="flex flex-wrap gap-2">
          {accountNavLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-sm text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The button at the bottom of the phone menu.
// Takes: nothing. Gives back: "Log in" for guests ("Book Now" on the login
// pages), nothing for logged-in people (Log out is on My Profile).
// (The menu closes itself when it is tapped; see HeaderNav.tsx.)
export async function PhoneMenuActions() {
  const user = await loadHeaderUser();
  if (!user) return <GuestHeaderButton fullWidth />;
  return null;
}
