// The layout shared by the booking steps:
//   - on phones: one column, with a STICKY BAR at the bottom of the screen
//     showing the total and the main button (CLAUDE.md section 7, and the
//     ".sticky" bar in docs/designs/PhoneBook1.html)
//   - on laptops: two columns, the step on the left and a summary card on the
//     right that stays in view while scrolling
// Where it's used: booking steps 1, 2 and 3.
//
// data-sticky-bar marks the bar, so the floating Chat With Us button
// (src/components/layout/ChatButton.tsx) moves up above it on phones.
//
// How the sticky bar works: `position: sticky; bottom: 0` keeps the bar
// pinned to the bottom of the screen while its box (BookingColumns) is on
// screen, then lets it scroll away with the page before the footer. For that
// it must be the LAST thing inside BookingColumns.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The two-column frame.
// Takes: the step's content (first) and a <BookingAside> (last), and extra classes.
// Gives back: a flex column on phones (so the sticky bar works) and a grid
// with a 22rem right column on laptops.
export function BookingColumns({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

// The classes that make an <aside> the sticky bar on phones and a sticky
// card on laptops. Shared with booking step 1's Booking details card
// (src/components/booking/BookingDetailsCard.tsx).
export const STICKY_ASIDE_CLASSES = cn(
  // Phone: stuck to the bottom, full width (-mx-5 cancels the page's side
  // padding), above the page content (z-10). The bottom padding grows on
  // iPhones with a home bar (safe-area-inset-bottom).
  "sticky bottom-0 z-10 -mx-5 flex flex-col gap-4 border-t border-line bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]",
  // Laptop: a normal card in the right column that sticks near the top
  "lg:top-6 lg:bottom-auto lg:mx-0 lg:rounded-3xl lg:border lg:p-6",
);

type BookingAsideProps = {
  total: string; // e.g. "₱550", already formatted
  totalLabel?: string; // the small word above it (default "Total")
  details?: ReactNode; // laptop only: shown above the total (e.g. the price summary)
  action: ReactNode; // the main button
  note?: ReactNode; // laptop only: a small line under the button
};

// The sticky bar (phone) / summary card (laptop).
// Takes: the total, its label, optional laptop-only details and note, and the button.
// Gives back: an <aside>. Phone: a full-width bar stuck to the bottom of the
// screen with the total on the left and the button on the right. Laptop: a
// rounded card that sticks near the top of the screen while scrolling.
export function BookingAside({ total, totalLabel = "Total", details, action, note }: BookingAsideProps) {
  return (
    <aside
      aria-label="Booking summary"
      data-sticky-bar
      className={STICKY_ASIDE_CLASSES}
    >
      {details && <div className="hidden lg:block">{details}</div>}
      <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-4">
        <div className="flex-1 lg:flex lg:items-baseline lg:justify-between">
          <p className="text-[11px] text-muted lg:text-sm lg:font-semibold lg:text-ink">{totalLabel}</p>
          <p className="font-heading text-xl font-semibold text-brown lg:text-2xl">{total}</p>
        </div>
        <div className="flex-1 lg:flex-none">{action}</div>
      </div>
      {note && <div className="hidden text-xs leading-relaxed text-muted lg:block">{note}</div>}
    </aside>
  );
}
