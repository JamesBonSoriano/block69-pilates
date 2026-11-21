// A small round icon button (a real link) for the "Action" column of the
// client tables (Version 1.9):
//   My Bookings  eye = View, pen = Manage
//   Payments     receipt icon = Receipt
// Where it's used: src/app/(client)/account/bookings/page.tsx and
// src/app/(client)/account/payments/page.tsx.
//
// It has an aria-label for screen readers and a small tooltip that shows on
// hover and on keyboard focus. 44px, so it's easy to tap on a phone.
// scroll={false}: the pop-up opens without jumping to the top of the page.

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

// One icon link.
// Takes: where it goes, the icon, the short tooltip text and the full label
// for screen readers (e.g. "View booking B69-1A2B3C4D").
// Gives back: the link.
export function IconActionLink({
  href,
  icon: Icon,
  tooltip,
  label,
}: {
  href: string;
  icon: LucideIcon;
  tooltip: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      aria-haspopup="dialog"
      className="group relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-brown transition-colors hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
    >
      <Icon aria-hidden="true" className="size-4" />
      {/* The tooltip: hidden from screen readers (they hear the aria-label) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {tooltip}
      </span>
    </Link>
  );
}
