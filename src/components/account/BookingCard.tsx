// One booking on My Bookings (the cards in docs/designs/PhoneMyBookings.html):
// date and time, status badge, drink · mat · money, transfer links, and the
// buttons that fit its status right now.
// Where it's used: src/app/(client)/account/bookings/page.tsx.
//
// Which buttons show (the database checks everything again when clicked):
//   unpaid hold            -> "Pay now" (back to its pay page)
//   confirmed, cafe cancelled the class -> a highlighted "free transfer" box
//   confirmed, more than 24h away       -> Transfer + Cancel (the Cancel box
//                                          explains "transfer instead")
//   confirmed, 12 to 24h / under 12h    -> Cancel (the box explains the voucher
//                                          or "no credit" first)
//   confirmed, class started            -> a short note, no buttons

import { ArrowRightLeft, CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { bookingReference, bookingStatusBadge, cancelTiming, paymentMethodLabel } from "@/lib/booking-rules";
import { formatClassDate, formatPeso, formatTime, formatTimeRange } from "@/lib/format";
import type { MyBookingListItem } from "@/types/app";
import { CancelBookingButton } from "./CancelBookingButton";

// One booking card.
// Takes: the booking (a row from get_my_bookings) and "now" in milliseconds
// (the page reads the clock once, during a real visit, and passes it to
// every card so they all agree).
// Gives back: an <li> with the card.
export function BookingCard({ booking, nowMs }: { booking: MyBookingListItem; nowMs: number }) {
  const date = formatClassDate(booking.class_date);
  const timeRange = formatTimeRange(booking.start_time, booking.end_time);
  const badge = bookingStatusBadge(booking.status);
  const transferHref = booking.can_transfer ? `/account/bookings/${booking.booking_id}/transfer` : null;

  // "Iced Matcha · Rented mat · Paid ₱550 with GCash"
  const money =
    booking.paid_amount !== null && booking.paid_method
      ? `Paid ${formatPeso(booking.paid_amount)} with ${paymentMethodLabel(booking.paid_method)}`
      : `Total ${formatPeso(booking.total)}`;
  const details = [booking.drink_choice, booking.mat_rental ? "Rented mat" : "Own mat", money]
    .filter(Boolean)
    .join(" · ");

  const rule = booking.status === "confirmed" ? booking.change_rule : null;

  return (
    <li>
      <Card className="flex flex-col gap-3">
        {/* Date + time on the left, status badge on the right */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-brown">{date.short}</h3>
            <p className="text-sm">{timeRange}</p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        <p className="text-sm text-muted">{details}</p>

        {/* Transfer links: where it came from / where it went */}
        {booking.moved_from_date && booking.moved_from_start_time && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <ArrowRightLeft aria-hidden="true" className="size-3.5 shrink-0 text-brown" />
            Moved from {formatClassDate(booking.moved_from_date).short} · {formatTime(booking.moved_from_start_time)}
          </p>
        )}
        {booking.moved_to_date && booking.moved_to_start_time && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <ArrowRightLeft aria-hidden="true" className="size-3.5 shrink-0 text-brown" />
            Moved to {formatClassDate(booking.moved_to_date).short} · {formatTime(booking.moved_to_start_time)}
          </p>
        )}

        <StatusPart booking={booking} rule={rule} transferHref={transferHref} />

        {/* Buttons for a confirmed booking that can still change */}
        {rule && rule !== "free_transfer" && rule !== "started" && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-3">
              {transferHref && (
                <ButtonLink href={transferHref} variant="secondary" className="flex-1 sm:flex-none">
                  <ArrowRightLeft aria-hidden="true" className="size-4" />
                  Transfer
                </ButtonLink>
              )}
              <CancelBookingButton
                bookingId={booking.booking_id}
                classLabel={`${date.short} · ${timeRange}`}
                rule={rule}
                transferHref={transferHref}
                {...cancelTiming(booking.class_date, booking.start_time, nowMs)}
              />
            </div>
            {/* Say why Transfer is missing, so nobody hunts for it */}
            {!transferHref && (
              <p className="text-xs text-muted">
                {rule === "already_transferred"
                  ? "This booking was already transferred once, so it can't be moved again."
                  : "Transfers close 24 hours before class."}
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted">Booking {bookingReference(booking.booking_id)}</p>
      </Card>
    </li>
  );
}

// The part of the card that depends on the status: a note, and for some
// statuses a button.
// Takes: the booking, its rule (confirmed only) and the transfer page link.
// Gives back: the note (or nothing).
function StatusPart({
  booking,
  rule,
  transferHref,
}: {
  booking: MyBookingListItem;
  rule: MyBookingListItem["change_rule"];
  transferHref: string | null;
}) {
  // The cafe cancelled the class: make the free transfer obvious
  if (rule === "free_transfer") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-warning-bg p-4 text-warning">
        <p className="flex items-start gap-2 text-sm font-semibold">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          The cafe cancelled this class. Move to another class for free, even within 24 hours.
        </p>
        {transferHref && (
          <ButtonLink href={transferHref} className="sm:self-start">
            Pick a new class
          </ButtonLink>
        )}
      </div>
    );
  }

  switch (booking.status) {
    case "pending_payment": {
      // Whole minutes left on the hold, rounded up ("1 minute" at 0:30)
      const minutes = Math.ceil(booking.hold_seconds_left / 60);
      return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-warning">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            Your seat is held for about {minutes} more minute{minutes === 1 ? "" : "s"}.
          </p>
          <ButtonLink href={`/book/pay/${booking.booking_id}`}>Pay now</ButtonLink>
        </div>
      );
    }
    case "awaiting_verification":
      return <p className="text-sm text-info">We&apos;re checking your payment. Your seat is held meanwhile.</p>;
    case "paid_needs_action":
      return (
        <p className="text-sm text-error">
          Your payment arrived after the class filled up. The cafe will contact you to sort it out.
        </p>
      );
    case "cancelled_with_voucher":
      return (
        <p className="text-sm">
          Your 50% voucher is in{" "}
          <Link href="/account/vouchers" className="font-semibold text-brown underline underline-offset-2">
            My Vouchers
          </Link>
          .
        </p>
      );
    case "confirmed":
      return rule === "started" && booking.is_upcoming ? (
        <p className="text-sm text-success">Your class has started. Enjoy!</p>
      ) : null;
    default:
      return null;
  }
}
