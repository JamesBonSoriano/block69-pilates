"use client";
// The My Account menu: Profile, My Bookings, Payments, My Vouchers, Notifications.
//   - laptop: a list in the left side card (".navi" items in docs/designs/Profile.html)
//   - phone:  a row of tabs you can swipe sideways, above the page
// Where it's used: src/app/(client)/account/layout.tsx.
//
// "use client" = it reads the current address (usePathname) to highlight the
// page you're on. Until the address is known it shows the same links,
// unhighlighted (the same trick as the header links in HeaderNav.tsx).

import { Bell, CalendarDays, Receipt, Ticket, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { accountNavLinks, isActiveLink } from "@/components/layout/nav-links";
import { cn } from "@/lib/cn";

// An icon for each account page (simple line icons, CLAUDE.md section 7).
const icons: Record<string, LucideIcon> = {
  "/account/profile": UserRound,
  "/account/bookings": CalendarDays,
  "/account/payments": Receipt,
  "/account/vouchers": Ticket,
  "/account/notifications": Bell,
};

type Variant = "sidebar" | "tabs";

// The account menu.
// Takes: which look to use ("sidebar" for laptops, "tabs" for phones).
// Gives back: a <nav> with the five links, the current one highlighted.
export function AccountNav({ variant }: { variant: Variant }) {
  return (
    <nav aria-label="My Account">
      <Suspense fallback={<AccountLinks variant={variant} pathname={null} />}>
        <ActiveAccountLinks variant={variant} />
      </Suspense>
    </nav>
  );
}

// Reads the current address, then draws the links.
// Takes: the look. Gives back: the links with the current page highlighted.
function ActiveAccountLinks({ variant }: { variant: Variant }) {
  return <AccountLinks variant={variant} pathname={usePathname()} />;
}

// Draws the five links.
// Takes: the look, and the current path (null = unknown, nothing highlighted).
// Gives back: a <ul> of links.
function AccountLinks({ variant, pathname }: { variant: Variant; pathname: string | null }) {
  return (
    <ul
      className={
        variant === "sidebar"
          ? "flex flex-col gap-1"
          : // Phone: one row that scrolls sideways inside its own box (-mx-5
            // + px-5 lets it reach the screen edges), so the page never does
            "-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
      }
    >
      {accountNavLinks.map((link) => {
        const Icon = icons[link.href];
        const active = isActiveLink(link.href, pathname);
        return (
          <li key={link.href} className={variant === "tabs" ? "shrink-0" : undefined}>
            <Link
              href={link.href}
              // aria-current tells screen readers "you are here"
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 text-sm text-brown transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                // Sidebar: the side card is Light Sage, so hover and the
                // current page use white to stand out from it
                variant === "sidebar"
                  ? "rounded-xl px-4 py-3 hover:bg-white/60"
                  : "rounded-full border border-line bg-white px-4 py-2 whitespace-nowrap",
                active &&
                  (variant === "sidebar"
                    ? "bg-white font-semibold hover:bg-white"
                    : "border-primary bg-tan-soft font-semibold"),
              )}
            >
              {Icon && <Icon aria-hidden="true" className="size-4.5 shrink-0" />}
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
