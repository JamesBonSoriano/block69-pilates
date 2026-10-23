// The parts of the client Header that depend on WHO is logged in:
//   - laptop:     "Log in", or the person icon + "Log out"
//   - phone bar:  the person icon next to the menu button
//   - phone menu: name + email + My Account links at the top, and
//                 Log in / Log out at the bottom
// The person icon (Revisions part 1, item 6) is the "My Account" link: it
// opens My Profile, and shows a small dot when the client has unread
// notifications (migration 12).
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
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { getCurrentUser } from "@/lib/auth/user";
import { getMyUnreadCount } from "@/lib/data/notifications";
import { initialsOf } from "@/lib/format";
import { accountHomeHref, accountNavLinks, adminHomeHref, loginHref } from "./nav-links";

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
    // Pass on Next.js's own internal signals (see the Home page's SessionList)
    unstable_rethrow(error);
    // Dev-mode "practice render" being stopped early: pass it on quietly
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error); // a real problem: show it in the terminal
    return null;
  }
});

// The round person icon that opens My Account (My Profile), with a dot for
// unread notifications. For an admin: their initials, linking to /admin.
// Takes: the header user, and size = "lg" (laptop) or "sm" (phone bar).
// Gives back: the link. The tap area is always 44px; on phones the visible
// circle inside it is a little smaller.
function AccountIcon({ user, size }: { user: HeaderUser; size: "lg" | "sm" }) {
  // The link itself: a 44px round tap area
  const tapArea =
    "flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream";
  // The visible tan circle inside it
  const circle = cn(
    "relative flex items-center justify-center rounded-full bg-tan-soft font-semibold text-brown",
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

  // Screen readers hear "My Account", plus how many updates are new
  const label =
    user.unread > 0 ? `My Account (${user.unread} new notification${user.unread === 1 ? "" : "s"})` : "My Account";
  return (
    <Link href={accountHomeHref} aria-label={label} title="My Account" className={tapArea}>
      <span aria-hidden="true" className={circle}>
        <UserRound className={size === "lg" ? "size-5" : "size-4.5"} />
        {/* The unread dot. data-unread-dot lets the Notifications page hide it
            straight away once the updates are marked as read. */}
        {user.unread > 0 && (
          <span data-unread-dot className="absolute right-0 top-0 size-3 rounded-full border-2 border-brown bg-error" />
        )}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// LAPTOP (1024px and wider)
// ---------------------------------------------------------------------------

// The right-hand end of the laptop header.
// Takes: nothing. Gives back: "Log in" for guests; for logged-in people the
// person icon (My Account) and "Log out" (for admins, initials to /admin).
export async function DesktopAccount() {
  const user = await loadHeaderUser();

  if (!user) {
    return (
      <ButtonLink href={loginHref} variant="light">
        Log in
      </ButtonLink>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <AccountIcon user={user} size="lg" />
      <LogoutButton variant="lightOutline" />
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

// The person icon next to the phone menu button (PhoneMenu.html had initials).
// Takes: nothing. Gives back: the icon link, or nothing for guests.
export async function PhoneAvatar() {
  const user = await loadHeaderUser();
  if (!user) return null;
  return <AccountIcon user={user} size="sm" />;
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
    <div className="mb-1 flex flex-col gap-4 border-b border-brown-line pb-5 pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tan-soft font-semibold text-brown"
        >
          {user.isAdmin ? user.initials : <UserRound className="size-5" />}
        </span>
        {/* min-w-0 + break-all: a long email wraps instead of overflowing */}
        <div className="min-w-0">
          {user.name && <p className="font-semibold text-white">{user.name}</p>}
          <p className="break-all text-xs text-tan">{user.email}</p>
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
      {/* My Account pages as small pills that wrap onto more lines (clients only).
          Notifications shows how many are new. */}
      {!user.isAdmin && (
        <ul aria-label="My Account" className="flex flex-wrap gap-2">
          {accountNavLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brown-line px-4 text-sm text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                {link.label}
                {link.href === "/account/notifications" && user.unread > 0 && (
                  <span data-unread-dot className="rounded-full bg-error px-1.5 text-[11px] font-semibold text-white">
                    {user.unread}
                    <span className="sr-only"> new</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The buttons at the bottom of the phone menu.
// Takes: nothing. Gives back: "Log in" for guests, "Log out" for logged-in people.
// (The menu closes itself when one of these is tapped; see HeaderNav.tsx.)
export async function PhoneMenuActions() {
  const user = await loadHeaderUser();

  if (!user) {
    return (
      <ButtonLink href={loginHref} variant="light" fullWidth>
        Log in
      </ButtonLink>
    );
  }

  return <LogoutButton variant="lightOutline" fullWidth />;
}
