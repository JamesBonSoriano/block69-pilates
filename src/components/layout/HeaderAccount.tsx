// The parts of the client Header that depend on WHO is logged in:
//   - laptop:     "Log in", or initials avatar + "Log out"
//   - phone bar:  the small initials avatar next to the menu button
//   - phone menu: name + email + My Account links at the top, and
//                 Log in / Log out at the bottom
// There is NO "Admin" link here any more (Revisions part 1, item 1): staff
// use /admin/login. An admin who browses the public pages can tap their
// avatar to get back to the admin Dashboard; they don't get the My Account
// links, because admins can't use those pages (src/proxy.ts).
// Where it's used: src/components/layout/Header.tsx, which puts EACH of these
// inside its own <Suspense>. The rest of the header (logo, links, menu button)
// stays static, so it shows at once and never waits for the login check.
//
// These are Server Components: they read the login cookies on the server.

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth/user";
import { initialsOf } from "@/lib/format";
import { accountNavLinks, adminHomeHref, loginHref } from "./nav-links";

// What the header shows about the logged-in person.
type HeaderUser = {
  name: string; // full name ("" if they haven't given one)
  email: string;
  initials: string; // e.g. "JS", for the round avatar
  isAdmin: boolean; // avatar links to the admin Dashboard? (display only; pages check again)
};

// Gets the few details the header shows about the logged-in person.
// Takes: nothing (reads the login cookies through getCurrentUser, which is
// shared, so the four header parts only ask Supabase once per visit).
// Gives back: a HeaderUser, or null for a guest. If the database can't be
// reached, the header just shows "Log in" instead of breaking the page.
async function loadHeaderUser(): Promise<HeaderUser | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    return {
      name: user.fullName,
      email: user.email,
      initials: initialsOf(user.fullName, user.email),
      // Only decides what the avatar links to. The admin pages check
      // is_admin() on the server themselves.
      isAdmin: user.role === "admin" && user.isActive,
    };
  } catch (error) {
    // Pass on Next.js's own internal signals (see the Home page's SessionList)
    unstable_rethrow(error);
    // Dev-mode "practice render" being stopped early: pass it on quietly
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error); // a real problem: show it in the terminal
    return null;
  }
}

// ---------------------------------------------------------------------------
// LAPTOP (1024px and wider)
// ---------------------------------------------------------------------------

// The right-hand end of the laptop header.
// Takes: nothing. Gives back: "Log in" for guests; for logged-in people
// their initials and "Log out" (for admins the initials link to /admin).
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
      {/* Initials avatar; the person's name is in its tooltip. For admins
          it's a link back to the admin Dashboard. */}
      {user.isAdmin ? (
        <Link
          href={adminHomeHref}
          title={`${user.name || user.email}: admin dashboard`}
          className="flex size-11 items-center justify-center rounded-full bg-tan-soft text-xs font-semibold text-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
        >
          <span aria-hidden="true">{user.initials}</span>
          <span className="sr-only">Admin dashboard (logged in as {user.name || user.email})</span>
        </Link>
      ) : (
        <span
          title={user.name || user.email}
          className="flex size-10 items-center justify-center rounded-full bg-tan-soft text-xs font-semibold text-brown"
        >
          <span aria-hidden="true">{user.initials}</span>
          <span className="sr-only">Logged in as {user.name || user.email}</span>
        </span>
      )}
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

// The small initials circle next to the phone menu button (PhoneMenu.html).
// Takes: nothing. Gives back: the circle, or nothing for guests.
export async function PhoneAvatar() {
  const user = await loadHeaderUser();
  if (!user) return null;
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full bg-tan-soft text-[11px] font-semibold text-brown"
    >
      {user.initials}
    </span>
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
    <div className="mb-1 flex flex-col gap-4 border-b border-brown-line pb-5 pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tan-soft font-semibold text-brown"
        >
          {user.initials}
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
      {/* My Account pages as small pills that wrap onto more lines (clients only) */}
      {!user.isAdmin && (
        <ul aria-label="My Account" className="flex flex-wrap gap-2">
          {accountNavLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-full border border-brown-line px-4 text-sm text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
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
