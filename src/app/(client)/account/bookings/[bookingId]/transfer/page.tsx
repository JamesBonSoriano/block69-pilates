// Transfer a booking: /account/bookings/<booking id>/transfer
// Where it's used: the "Transfer" button on My Bookings, "Transfer instead"
// in the Cancel box, and "Pick a new class" when the cafe cancelled a class.
// Layout follows booking step 1 (docs/designs/PhoneBook1.html): the open
// classes by day, and a sticky bar (laptop: side card) with the button.
//
// ONLY THE BOOKING'S OWNER: requireClient() checks the login, and the booking
// is found in get_my_bookings() (the caller's own bookings only). Someone
// else's booking id gives "page not found".
//
// Only shown when a transfer is allowed right now (get_my_bookings' can_transfer):
//   - more than 24 hours before class, and never transferred before, or
//   - the cafe cancelled the class (free transfer, any time).
// Otherwise the page explains why not. transfer_my_booking() checks all of
// this again, with a lock, when the person clicks "Move my booking".

import { CircleAlert, Info } from "lucide-react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { TransferForm } from "@/components/account/TransferForm";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { requireClient } from "@/lib/auth/user";
import { bookingStatusBadge, seatBadge } from "@/lib/booking-rules";
import { getMyBookings } from "@/lib/data/account";
import { getBookingSessions } from "@/lib/data/booking";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import type { MyBookingListItem, OpenSession } from "@/types/app";

export const metadata = { title: "Transfer a booking" };

// The transfer page.
// Takes: params (the booking id from the address).
// Gives back: the heading, then the live part inside <Suspense>.
export default function TransferPage({ params }: PageProps<"/account/bookings/[bookingId]/transfer">) {
  return (
    <>
      <AccountHeading title="Transfer a booking" intro="Move your class to another day or time." />
      <Suspense fallback={<AccountLoading label="the classes" />}>
        <TransferContent params={params} />
      </Suspense>
    </>
  );
}

// Loads the booking and the open classes, and draws the right thing.
// Takes: the params promise.
// Gives back: the class picker, or an explanation if the booking can't be
// moved right now. "Page not found" for a booking that isn't theirs.
async function TransferContent({
  params,
}: {
  params: PageProps<"/account/bookings/[bookingId]/transfer">["params"];
}) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  await requireClient(`/account/bookings/${bookingId}/transfer`);

  let bookings: MyBookingListItem[];
  let sessions: OpenSession[];
  let settings;
  try {
    [bookings, sessions, settings] = await Promise.all([getMyBookings(), getBookingSessions(), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="the classes" />;
  }

  const booking = bookings.find((row) => row.booking_id === bookingId);
  if (!booking) notFound();

  const date = formatClassDate(booking.class_date);
  const freeTransfer = booking.change_rule === "free_transfer";

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

  // Classes they could move to: bookable now, not this class, and not a
  // class they already hold a seat in (the database refuses those anyway)
  const myClasses = new Set(
    bookings.filter((row) => row.is_upcoming && row.status !== "paid_needs_action").map((row) => row.session_id),
  );
  const choices = sessions.filter((session) => session.is_bookable && !myClasses.has(session.session_id));
  const days = groupByDate(choices);

  return (
    <div className="flex flex-col gap-5">
      {summary}

      {/* The rules for THIS transfer, in plain words */}
      {freeTransfer ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm leading-relaxed text-warning">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>The cafe cancelled this class, so this transfer is free.</strong> You can pick any open class,
            even one less than 24 hours away. Your drink and mat stay the same, and there&apos;s nothing to pay.
            After this, the new booking can&apos;t be transferred again.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2.5 rounded-2xl bg-info-bg px-4 py-3.5 text-sm leading-relaxed text-info">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>A booking can only be transferred once.</strong> Your new class keeps the same drink and mat, and
            there&apos;s nothing more to pay.
            {!booking.mat_rental && (
              <> If you&apos;d like a mat after all, pay the {formatPeso(settings.matPrice)} rental in cash at the cafe.</>
            )}
          </span>
        </p>
      )}

      {days.length === 0 ? (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">
            No other class has a free seat right now. Please check again later, or message us with Chat With Us.
          </p>
          <ButtonLink href="/account/bookings" variant="secondary">
            Back to My Bookings
          </ButtonLink>
        </Card>
      ) : (
        <TransferForm
          bookingId={booking.booking_id}
          paidLabel={formatPeso(booking.paid_amount ?? booking.total)}
          note="Pick a class, then press the button. Your old seat is given up and the new one is yours."
        >
          <ul className="grid gap-4 sm:grid-cols-2">
            {days.map((day) => (
              <li key={day.date}>
                <Card>
                  <RadioGroup legend={formatClassDate(day.date).full} name={`day-${day.date}`} legendStyle="heading">
                    {day.sessions.map((session) => {
                      const badge = seatBadge(session.seats_left, session.state, session.capacity);
                      return (
                        <RadioOption
                          key={session.session_id}
                          // All classes share one name, so only ONE can be picked
                          name="session_id"
                          value={session.session_id}
                          required
                          label={formatTimeRange(session.start_time, session.end_time)}
                          description="Mindful Mat Pilates · Beginner"
                          aside={<Badge variant={badge.variant}>{badge.label}</Badge>}
                        />
                      );
                    })}
                  </RadioGroup>
                </Card>
              </li>
            ))}
          </ul>
        </TransferForm>
      )}
    </div>
  );
}

// Says why a booking can't be transferred right now.
// Takes: the booking (from get_my_bookings).
// Gives back: one or two plain-English sentences.
function notAllowedReason(booking: MyBookingListItem): string {
  if (booking.status !== "confirmed") {
    return `This booking can't be transferred because it's "${bookingStatusBadge(booking.status).label}". Only confirmed bookings can be moved.`;
  }
  switch (booking.change_rule) {
    case "already_transferred":
      return "This booking was already transferred once, so it can't be moved again. A booking can only be transferred one time.";
    case "started":
      return "This class has already started, so the booking can't be moved.";
    default:
      // "voucher" or "no_credit": less than 24 hours before class
      return "Transfers close 24 hours before class. You can still cancel it from My Bookings (see what you'd get there first).";
  }
}

// One day with its classes.
type ClassDay = { date: string; sessions: OpenSession[] };

// Puts the classes into days.
// Takes: the classes, earliest first (as get_open_sessions gives them).
// Gives back: one entry per date, in the same order.
function groupByDate(sessions: OpenSession[]): ClassDay[] {
  const days: ClassDay[] = [];
  for (const session of sessions) {
    const last = days[days.length - 1];
    if (last && last.date === session.date) {
      last.sessions.push(session);
    } else {
      days.push({ date: session.date, sessions: [session] });
    }
  }
  return days;
}
