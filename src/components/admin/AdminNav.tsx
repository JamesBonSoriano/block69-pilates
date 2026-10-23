"use client";
// The admin menu links, in three looks:
//   "sidebar" the brown side menu on laptops (docs/designs/AdminBookings.html)
//   "menu"    the full-screen brown menu that opens from the phone top bar
//   "tabs"    the white bottom tab bar on phones (PhoneAdminDashboard.html):
//             only the 4 pages the counter uses most
// Where it's used: src/app/admin/layout.tsx and AdminPhoneMenu.tsx.
//
// "use client" = it reads the current address (usePathname) to highlight the
// page you're on. Until the address is known it shows the same links,
// unhighlighted (the same trick as the client header in HeaderNav.tsx).

import {
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Settings,
  Tag,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { adminNavLinks, isActiveAdminLink } from "@/components/layout/nav-links";
import { cn } from "@/lib/cn";

// A simple line icon for each admin page (CLAUDE.md section 7: no emoji).
const icons: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/bookings": ClipboardList,
  "/admin/walk-in": UserPlus,
  "/admin/attendance": ListChecks,
  "/admin/payments": Receipt,
  "/admin/schedule": CalendarDays,
  "/admin/pricing": Tag,
  "/admin/content": FileText,
  "/admin/users": Users,
  "/admin/settings": Settings,
};

type Variant = "sidebar" | "menu" | "tabs";

// The admin menu.
// Takes: which look to use (see the top of this file).
// Gives back: a <nav> with the links, the current page highlighted.
export function AdminNav({ variant }: { variant: Variant }) {
  return (
    <nav
      aria-label={variant === "tabs" ? "Admin shortcuts" : "Admin menu"}
      className={
        variant === "tabs"
          ? // Sticks to the bottom of the phone screen. The bottom padding
            // uses the "safe area inset" so the bar stays above the iPhone's
            // home bar. print:hidden = not printed.
            // (Never write a half-finished Tailwind class in a comment here:
            // Tailwind reads comments too and would try to build it.)
            "sticky bottom-0 z-30 border-t border-admin-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
          : undefined
      }
    >
      <Suspense fallback={<AdminLinks variant={variant} pathname={null} />}>
        <ActiveAdminLinks variant={variant} />
      </Suspense>
    </nav>
  );
}

// Reads the current address, then draws the links.
// Takes: the look. Gives back: the links with the current page highlighted.
function ActiveAdminLinks({ variant }: { variant: Variant }) {
  return <AdminLinks variant={variant} pathname={usePathname()} />;
}

// Draws the links.
// Takes: the look, and the current path (null = unknown, nothing highlighted).
// Gives back: a <ul> of links.
function AdminLinks({ variant, pathname }: { variant: Variant; pathname: string | null }) {
  // The bottom tab bar only has the 4 everyday pages
  const links = variant === "tabs" ? adminNavLinks.filter((link) => link.tab) : adminNavLinks;

  return (
    <ul className={variant === "tabs" ? "flex" : "flex flex-col gap-1"}>
      {links.map((link) => {
        const Icon = icons[link.href];
        const active = isActiveAdminLink(link.href, pathname);

        if (variant === "tabs") {
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brown",
                  active ? "font-semibold text-brown" : "text-muted",
                )}
              >
                {/* The icon sits in a small rounded square, brown when active (as in the mockup) */}
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg",
                    active ? "bg-brown text-card" : "bg-admin-bg text-brown",
                  )}
                >
                  {Icon && <Icon aria-hidden="true" className="size-4" />}
                </span>
                {link.tabLabel ?? link.label}
              </Link>
            </li>
          );
        }

        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream",
                variant === "menu" ? "text-[17px]" : "text-sm",
                active ? "bg-admin-active font-semibold text-ink" : "text-tan-soft hover:bg-cream/10",
              )}
            >
              {Icon && <Icon aria-hidden="true" className="size-4.5 shrink-0" />}
              <span className="flex-1">{link.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
