// One class on the admin Dashboard: time, seats taken / capacity, what to
// prepare (drinks and mats), who is booked, and a Cancel class button.
// (Version 1.4 removed the Attendance and Walk-in buttons with their pages.)
// Where it's used: src/app/admin/page.tsx ("Today's classes" and "Next classes").
// Layout follows the class cards in docs/designs/PhoneAdminDashboard.html.

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { isComing, prepLine, prepSummary } from "@/lib/admin/display";
import { adminBookingStatusBadge, adminSeatsBadge } from "@/lib/booking-rules";
import { formatClassDate, formatTimeRange } from "@/lib/format";
import type { AdminRosterItem, AdminSession } from "@/types/app";
import { AdminCard } from "./AdminUi";
import { CancelClassButton } from "./CancelClassButton";

type ClassCardProps = {
  session: AdminSession;
  roster: AdminRosterItem[]; // the guests in THIS class
  showDate?: boolean; // true for "Next classes" (other days); today's cards only show the time
};

// One class card.
// Takes: the class, its guests, and whether to show the date.
// Gives back: a white card (inside an <li>, so the page can list them).
export function ClassCard({ session, roster, showDate = false }: ClassCardProps) {
  const seats = adminSeatsBadge(session.seats_taken, session.capacity, session.status);
  const date = formatClassDate(session.date);
  const time = formatTimeRange(session.start_time, session.end_time);
  const coming = roster.filter(isComing);
  const unsettled = roster.filter((guest) => !isComing(guest));
  const canCancel = session.status !== "cancelled" && !session.has_ended;

  return (
    <li>
      <AdminCard className="flex flex-col gap-3 p-4">
        {/* Time (and date) + seats badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-sans text-sm font-semibold text-ink lg:text-[15px]">
              {showDate ? `${date.short} · ${time}` : time}
            </h3>
            <p className="text-xs text-muted">
              {session.status === "cancelled"
                ? "Cancelled by the cafe: clients can transfer for free"
                : session.has_ended
                  ? "Class ended"
                  : session.has_started
                    ? "Class in progress"
                    : prepLine(prepSummary(roster))}
            </p>
          </div>
          <Badge variant={seats.variant}>{seats.label}</Badge>
        </div>

        {/* Who is booked */}
        {coming.length > 0 && (
          <ul className="flex flex-col divide-y divide-admin-line border-t border-admin-line">
            {coming.map((guest) => (
              <li key={guest.booking_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link
                  href={`/admin/bookings/${guest.booking_id}`}
                  className="min-w-0 truncate font-medium text-ink underline-offset-2 hover:underline"
                >
                  {guest.guest_name}
                  {guest.is_walkin && <span className="ml-1.5 text-xs font-normal text-muted">(walk-in)</span>}
                </Link>
                <span className="shrink-0 text-xs text-muted">
                  {guest.drink_choice ?? "Drink at cafe"} · {guest.mat_rental ? "Mat" : "Own mat"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Bookings that aren't settled yet (paying now, being checked, late payment) */}
        {unsettled.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {unsettled.map((guest) => {
              const badge = adminBookingStatusBadge(guest.status);
              return (
                <li key={guest.booking_id} className="flex items-center justify-between gap-3 text-xs">
                  <Link href={`/admin/bookings/${guest.booking_id}`} className="min-w-0 truncate text-muted hover:underline">
                    {guest.guest_name}
                  </Link>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}

        {/* The only action here: cancel the class (hidden once it ended) */}
        {canCancel && (
          <div className="flex sm:justify-end">
            <CancelClassButton
              sessionId={session.session_id}
              classLabel={`${date.short} · ${time}`}
              bookedCount={session.seats_taken}
              className="w-full px-3 sm:w-auto"
            />
          </div>
        )}
      </AdminCard>
    </li>
  );
}
