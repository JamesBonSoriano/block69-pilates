// Transfer a booking: /account/bookings/<booking id>/transfer
// Where it's used: the "Transfer" button on My Bookings, "Transfer instead"
// in the Cancel box, "Pick a new class" when the cafe cancelled a class, and
// "Move to another class" for a late payment.
// Layout (Change 17, Part G): the same as booking step 1. A month navigator
// (◀ October 2026 ▶, scheduled months), date chips for the dates
// that have classes, that date's classes below, and the summary card on the
// right (phone: the sticky bar) with "Move my booking". Above it: the
// "Moving this booking" card and the once-only note.
//
// The class being moved, and classes the person is already booked in, are
// SHOWN (greyed out, badge "Your booking" / "You're booked") instead of left
// out, so no date or time ever seems to be missing from the list.
//
// ONLY THE BOOKING'S OWNER: requireClient() checks the login, and the booking
// is found in get_my_bookings() (the caller's own bookings only). Someone
// else's booking id gives "page not found".
//
// Only shown when a transfer is allowed right now (get_my_bookings' can_transfer):
//   - more than 24 hours before class, and never transferred before, or
//   - the cafe cancelled the class (free transfer, any time), or
//   - a late payment ('paid_needs_action'): free, any time (migration 19).
// Otherwise the page explains why not. transfer_my_booking() checks all of
// this again, with a lock, when the person clicks "Move my booking".
//
// The address can carry ?show_month= / ?month= / ?date= (the month picker's
// buttons when JavaScript hasn't loaded, see ClassDayPicker.tsx).

import { CircleAlert, Info } from "lucide-react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { TransferForm } from "@/components/account/TransferForm";
import { ClassDayPicker } from "@/components/booking/ClassDayPicker";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { firstParam } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import { buildClassPicker } from "@/lib/booking/class-picker";
import { bookingStatusBadge } from "@/lib/booking-rules";
import { getMyBookings } from "@/lib/data/account";
import { getBookingCalendar } from "@/lib/data/booking";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatMoveBy, formatPeso, formatTimeRange, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import { isUuid } from "@/lib/validation";
import type { MyBookingListItem } from "@/types/app";

// Version 1.7: the word the client sees is "Re-schedule" (the route stays /transfer)
export const metadata = { title: "Re-schedule a booking" };

// The transfer page.
// Takes: params (the booking id from the address) and searchParams (the
// month picker's no-JavaScript buttons).
// Gives back: the heading, then the live part inside <Suspense>.
export default function TransferPage({ params, searchParams }: PageProps<"/account/bookings/[bookingId]/transfer">) {
  return (
    <>
      <AccountHeading title="Re-schedule a booking" intro="Move your class to another day or time." />
      <Suspense fallback={<AccountLoading label="the classes" />}>
        <TransferContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Loads the booking and the classes, and draws the right thing.
// Takes: the params and searchParams promises.
// Gives back: the class picker, or an explanation if the booking can't be
// moved right now. "Page not found" for a booking that isn't theirs.
async function TransferContent({
  params,
  searchParams,
}: Pick<PageProps<"/account/bookings/[bookingId]/transfer">, "params" | "searchParams">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  await requireClient(`/account/bookings/${bookingId}/transfer`);
  const query = await searchParams;

  // Today in the Philippines
  // (requireClient() has waited for a real visit, so reading the clock is fine)
  const nowMs = nowForThisVisit();
  const today = manilaDateString(nowMs);

  let bookings: MyBookingListItem[];
  // The same calendar navigation is available when moving an existing booking.
  let calendar: Awaited<ReturnType<typeof getBookingCalendar>>;
  let settings;
  try {
    [bookings, calendar, settings] = await Promise.all([
      getMyBookings(),
      getBookingCalendar(today, firstParam(query.show_month) ?? firstParam(query.month)),
      getPublicSettings(),
    ]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="the classes" />;
  }

  const booking = bookings.find((row) => row.booking_id === bookingId);
  if (!booking) notFound();

  const date = formatClassDate(booking.class_date);
  const freeTransfer = booking.change_rule === "free_transfer";
  const lateTransfer = booking.change_rule === "late_payment";

  // The booking being moved
  const summary = (
    <Card className="flex flex-col gap-1.5">
      <Overline as="h2">Moving this booking</Overline>
      <p className="font-heading text-base font-semibold text-brown">
        {date.full} · {formatTimeRange(booking.start_time, booking.end_time)}
      </p>
      <p className="text-sm text-muted">
        {[booking.drink_choice, booking.mat_rental ? "Rented mat" : "Own mat"].filter(Boolean).join(" · ")}
      </p>
    </Card>
  );

  // Not allowed right now: say why, and go back
  if (!booking.can_transfer) {
    return (
      <div className="flex flex-col gap-5">
        {summary}
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm leading-relaxed">{notAllowedReason(booking)}</p>
          <ButtonLink href="/account/bookings" variant="secondary">
            Back to My Bookings
          </ButtonLink>
        </Card>
      </div>
    );
  }

  // Classes they can't move to (the database refuses them anyway): this
  // class, and classes they already hold a seat in. Shown greyed out.
  const unavailable = new Map<string, string>();
  for (const row of bookings) {
    if (row.is_upcoming && row.status !== "paid_needs_action") unavailable.set(row.session_id, "You're booked");
  }
  unavailable.set(booking.session_id, "Your booking");

  const { sessions, months, month } = calendar;
  const picker = buildClassPicker({
    sessions,
    months,
    askedMonth: month,
    askedDate: firstParam(query.date),
    pickedSessionId: null,
    unavailable,
  });
  // Date and time of every class that can be picked, for the summary card
  const sessionLabels = Object.fromEntries(
    sessions
      .filter((s) => s.is_bookable && !unavailable.has(s.session_id) && picker.monthSessionIds.has(s.session_id))
      .map((s) => [s.session_id, { date: formatClassDate(s.date).full, time: formatTimeRange(s.start_time, s.end_time) }]),
  );

  return (
    <div className="flex flex-col gap-5">
      {summary}

      {/* The rules for THIS transfer, in plain words */}
      {lateTransfer ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm leading-relaxed text-warning">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Your payment came in after your seat hold expired, so this move is free.</strong> Pick any open
            class with a free seat, even one less than 24 hours away. Your drink and mat stay the same, and
            there&apos;s nothing more to pay. After this, the new booking can&apos;t be re-scheduled again.
          </span>
        </p>
      ) : freeTransfer ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm leading-relaxed text-warning">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>The cafe cancelled this class, so re-scheduling is free.</strong> You can pick any open class,
            even one less than 24 hours away. Your drink and mat stay the same, and there&apos;s nothing to pay.
            After this, the new booking can&apos;t be re-scheduled again.
            {/* Version 1.5: the free move has a deadline */}
            {booking.move_by && <> Move by {formatMoveBy(booking.move_by, nowMs)}.</>}
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2.5 rounded-2xl bg-info-bg px-4 py-3.5 text-sm leading-relaxed text-info">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>A booking can only be re-scheduled once.</strong> Your new class keeps the same drink and mat, and
            there&apos;s nothing more to pay.
            {!booking.mat_rental && (
              <> If you&apos;d like a mat after all, pay the {formatPeso(settings.matPrice)} rental in cash at the cafe.</>
            )}
          </span>
        </p>
      )}

      <TransferForm
        bookingId={booking.booking_id}
        paidLabel={formatPeso(booking.paid_amount ?? booking.total)}
        sessionLabels={sessionLabels}
        note="Pick a class, then press the button. Your old seat is given up and the new one is yours."
      >
        <ClassDayPicker
          months={picker.months}
          days={picker.days}
          initialDate={picker.initialDate}
          initialSessionId={null}
          radioName="session_id"
          reloadAction={`/account/bookings/${booking.booking_id}/transfer`}
          reloadMethod="get"
          emptyText={`There are no classes in ${picker.months.label} yet. Try another month, or message us with Chat With Us.`}
        />
      </TransferForm>
    </div>
  );
}

// Says why a booking can't be transferred right now.
// Takes: the booking (from get_my_bookings).
// Gives back: one or two plain-English sentences.
function notAllowedReason(booking: MyBookingListItem): string {
  if (booking.status === "paid_needs_action") {
    return "Your payment doesn't match the booking total, so this booking can't be moved here. The cafe will contact you to sort it out.";
  }
  if (booking.status !== "confirmed") {
    return `This booking can't be re-scheduled because it's "${bookingStatusBadge(booking.status).label}". Only confirmed bookings can be moved.`;
  }
  switch (booking.change_rule) {
    case "already_transferred":
      return "This booking was already re-scheduled once, so it can't be moved again. A booking can only be re-scheduled one time.";
    case "started":
      return "This class has already started, so the booking can't be moved.";
    // Version 1.5: the free move after a cafe cancellation has a deadline
    case "move_window_ended":
      return `The cafe cancelled this class, and the time to move it for free ended${booking.move_by ? ` on ${formatClassDate(booking.move_by).short}` : ""}. Please message the cafe with Chat With Us if you need help.`;
    default:
      // "voucher" or "no_credit": less than 24 hours before class
      return "Re-scheduling closes 24 hours before class. You can still cancel it from My Bookings (see what you'd get there first).";
  }
}
