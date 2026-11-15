// One booking on My Bookings (the cards in docs/designs/PhoneMyBookings.html):
// date and time, status badge, drink · mat · money, transfer links, and the
// buttons that fit its status right now.
// Where it's used: src/app/(client)/account/bookings/page.tsx.
//
// Which buttons show (the database checks everything again when clicked):
//   unpaid hold            -> "Pay now" (back to its pay page), but never in
//                             a class the cafe cancelled (Version 1.6; the
//                             database releases those holds anyway)
//   transfer being checked -> "Awaiting verification" with an hourglass;
//                             in a cancelled class it says the free move
//                             comes once the payment is approved (Version 1.6)
//   payment rejected       -> "Payment rejected" + "Book again" (Version 1.6)
//   confirmed, cafe cancelled the class -> a highlighted "free transfer" box
//                                          with "Move by Nov 30" (Version 1.5)
//   confirmed, cafe cancelled, window over -> a short note, no buttons (Past)
//   confirmed, more than 24h away       -> Transfer + Cancel (the Cancel box
//                                          explains "transfer instead")
//   confirmed, 12 to 24h / under 12h    -> Cancel (the box explains the voucher
//                                          or "no credit" first)
//   confirmed, class started            -> a short note, no buttons
//   paid late (paid_needs_action)       -> a short line + "Move to another
//                                          class" (free, any time; migration 19)

import { ArrowRightLeft, CircleAlert, Clock, Hourglass } from "lucide-react";
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { bookingReference, bookingStatusBadge, cancelTiming, paymentMethodLabel } from "@/lib/booking-rules";
import { formatClassDate, formatMoveBy, formatPeso, formatTime, formatTimeRange } from "@/lib/format";
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
  const transferHref = booking.can_transfer ? `/account/bookings/${booking.booking_id}/transfer` : null;

  // "Iced Matcha · Rented mat · Paid ₱550 with GCash"
  const money =
    booking.paid_amount !== null && booking.paid_method
      ? `Paid ${formatPeso(booking.paid_amount)} with ${paymentMethodLabel(booking.paid_method)}`
      : `Total ${formatPeso(booking.total)}`;
  const details = [booking.drink_choice, booking.mat_rental ? "Rented mat" : "Own mat", money]
    .filter(Boolean)
    .join(" · ");

  // The Cancel / Transfer rule for a confirmed booking (late payments have
  // their own box below, so "late_payment" is left out here)
  const rule = booking.status === "confirmed" && booking.change_rule !== "late_payment" ? booking.change_rule : null;
  // The status badge. Version 1.5: once the time to move a cafe-cancelled
  // class is over, it says "Class cancelled" (not a green "Confirmed").
  // Version 1.6: a rejected transfer says "Payment rejected" (not "Expired").
  const badge: { label: string; variant: BadgeVariant } = booking.payment_rejected
    ? { label: "Payment rejected", variant: "error" }
    : rule === "move_window_ended"
      ? { label: "Class cancelled", variant: "neutral" }
      : bookingStatusBadge(booking.status);
  // Version 1.6: the pending (hourglass) icon while the cafe checks a transfer
  const checking = booking.status === "awaiting_verification";

  return (
    <li>
      <Card className="flex flex-col gap-3">
        {/* Date + time on the left, status badge on the right */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-brown">{date.short}</h3>
            <p className="text-sm">{timeRange}</p>
          </div>
          <Badge variant={badge.variant}>
            {checking && <Hourglass aria-hidden="true" className="size-3" />}
            {badge.label}
          </Badge>
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

        <StatusPart booking={booking} rule={rule} transferHref={transferHref} nowMs={nowMs} />

        {/* Buttons for a confirmed booking that can still change */}
        {rule && rule !== "free_transfer" && rule !== "move_window_ended" && rule !== "started" && (
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
// Takes: the booking, its rule (confirmed only), the transfer page link and
// "now" in milliseconds (for the "Move by" date's year).
// Gives back: the note (or nothing).
function StatusPart({
  booking,
  rule,
  transferHref,
  nowMs,
}: {
  booking: MyBookingListItem;
  rule: MyBookingListItem["change_rule"];
  transferHref: string | null;
  nowMs: number;
}) {
  // "Nov 30": the last day of the free move (Version 1.5), if there is one
  const moveBy = booking.move_by ? formatMoveBy(booking.move_by, nowMs) : null;

  // The cafe cancelled the class: make the free transfer obvious, with its
  // deadline
  if (rule === "free_transfer") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-warning-bg p-4 text-warning">
        <p className="flex items-start gap-2 text-sm font-semibold">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            The cafe cancelled this class. Move to another class for free, even within 24 hours.
            {moveBy && <span className="mt-1 block">Move by {moveBy}.</span>}
          </span>
        </p>
        {transferHref && (
          <ButtonLink href={transferHref} className="sm:self-start">
            Pick a new class
          </ButtonLink>
        )}
      </div>
    );
  }

  // The cafe cancelled the class and the time to move it is over (Version 1.5)
  if (rule === "move_window_ended") {
    return (
      <p className="text-sm text-muted">
        The cafe cancelled this class. The time to move it for free ended{moveBy ? ` on ${moveBy}` : ""}.
      </p>
    );
  }

  // Version 1.6: the cafe rejected the GCash / BPI screenshot. The seat was
  // let go; they can book (and pay) again while the class is still ahead.
  if (booking.payment_rejected) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-error-bg p-4 text-error">
        <p className="flex items-start gap-2 text-sm font-semibold">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          The cafe couldn&apos;t approve your payment, so this seat was let go.
          {booking.is_upcoming ? " You can book and pay again." : ""}
        </p>
        {booking.is_upcoming && (
          <ButtonLink
            // Step 2 again for the same class (with the same mat choice). If it
            // can't be booked any more, that page says so and offers others.
            href={`/book/details?session=${booking.session_id}${booking.mat_rental ? "&mat=yes" : ""}`}
            className="sm:self-start"
          >
            Book again
          </ButtonLink>
        )}
      </div>
    );
  }

  switch (booking.status) {
    case "pending_payment": {
      // Version 1.6: never "Pay now" for a class the cafe cancelled (the
      // database releases these holds when the class is cancelled)
      if (booking.session_status === "cancelled") {
        return (
          <p className="text-sm text-muted">
            The cafe cancelled this class. Your seat hold was released and you were not charged.
          </p>
        );
      }
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
      // Version 1.6: the seat stays held while the cafe checks. If the cafe
      // cancelled the class meanwhile, the free move comes after approval.
      return booking.session_status === "cancelled" ? (
        <p className="flex items-start gap-2 text-sm text-info">
          <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Class cancelled – the cafe is still checking your payment. Once approved, you can move to another class
          for free.
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm text-info">
          <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          We&apos;re checking your payment. Your seat is held until then.
        </p>
      );
    case "paid_needs_action":
      // Paid after the seat hold ended: they move themselves, for free
      return (
        <div className="flex flex-col gap-3 rounded-2xl bg-warning-bg p-4 text-warning">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {transferHref
              ? "Your payment came in after your seat hold expired, so this seat couldn't be confirmed. Move to another class for free."
              : "Your payment came in after your seat hold expired, so this seat couldn't be confirmed. The cafe will contact you to sort it out."}
          </p>
          {transferHref && (
            <ButtonLink href={transferHref} className="sm:self-start">
              <ArrowRightLeft aria-hidden="true" className="size-4" />
              Move to another class
            </ButtonLink>
          )}
        </div>
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
