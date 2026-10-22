// One class session as a card: a brown date tile, the time, and a seats-left
// badge (docs/designs/PhoneHome.html, "Next open sessions").
// Where it's used: the Home page. Booking step 1 (Step 9) can reuse it.

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { seatBadge } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { formatClassDate, formatTimeRange } from "@/lib/format";
import type { OpenSession } from "@/types/app";

// A session card.
// Takes: one session from get_open_sessions() (with its live seats left).
// Gives back: a card that links to booking for that class, or a greyed-out
// card (not a link) if the class can't be booked (full, closed, ...).
export function SessionCard({ session }: { session: OpenSession }) {
  const date = formatClassDate(session.date);
  const time = formatTimeRange(session.start_time, session.end_time);
  const badge = seatBadge(session.seats_left, session.state);

  // What's inside the card (the same for both the link and the greyed version)
  const content = (
    <>
      {/* Date tile, e.g. THU / 23 */}
      <div
        aria-hidden="true"
        className="flex size-13 shrink-0 flex-col items-center justify-center rounded-[14px] bg-brown text-cream"
      >
        <span className="text-[10px] font-bold">{date.weekday}</span>
        <span className="font-heading text-xl font-semibold leading-tight text-white">{date.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        {/* The full date for screen readers (the tile above is hidden from them) */}
        <span className="sr-only">{date.full}, </span>
        <p className="text-sm font-semibold text-ink">{time}</p>
        <p className="text-xs text-muted">Mindful Mat Pilates · Beginner</p>
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </>
  );

  const cardClasses =
    "flex items-center gap-3.5 rounded-[20px] border border-line bg-card p-4";

  // Can't be booked: show it greyed out, and not clickable
  if (!session.is_bookable) {
    return <div className={cn(cardClasses, "opacity-60")}>{content}</div>;
  }

  // Bookable: the whole card links to booking step 1 with this class picked
  // (the booking page is built in Step 9)
  return (
    <Link
      href={`/book?session=${session.session_id}`}
      className={cn(
        cardClasses,
        "transition-colors hover:border-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
      )}
    >
      {content}
    </Link>
  );
}
