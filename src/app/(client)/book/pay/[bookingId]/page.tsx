// Booking step 3, "Review and pay": /book/pay/<booking id>
// Where it's used: holdSeat() sends people here right after their seat is
// held (src/lib/booking/actions.ts), and step 2 sends people back here if
// they already have an unpaid hold for that class.
// Layout follows docs/designs/PhoneBook3.html.
//
// ONLY THE BOOKING'S OWNER can open it: src/proxy.ts and requireUser() make
// sure someone is logged in, and get_my_booking() (migration 6) only ever
// gives back the caller's OWN booking. Anyone else gets "page not found",
// so nobody can even tell whether a booking id exists.
//
// What it shows, by the booking's status:
//   pending_payment, hold still running -> the summary, a live countdown, the
//                                          GCash / Maya / card choice and Pay
//                                          button (PayMongo), the manual
//                                          transfer backup (if turned on), and
//                                          "Change details" (gives up the hold
//                                          and goes back to step 2)
//   pending_payment after the hold, or expired -> "Your seat was released"
//                                          (the Payment expired page)
//   confirmed / attended / paid_needs_action -> sent on to /book/done/<id>
//   awaiting_verification               -> "We're checking your payment"
//                                          (a manual transfer screenshot)
//   anything else (cancelled, transferred, ...) -> "This booking is closed"
// ?payment=cancelled = PayMongo's "back" link (cancel_url): a note that
// nothing was paid and the seat is still held. ?payment=sent = the manual
// transfer was just sent.

import { Clock, Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { BookingSteps } from "@/components/booking/BookingSteps";
import { ChangeDetailsButton } from "@/components/booking/ChangeDetailsButton";
import { HoldExpired } from "@/components/booking/HoldExpired";
import { PayHold } from "@/components/booking/PayHold";
import { PriceSummary } from "@/components/booking/PriceSummary";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormMessage } from "@/components/ui/FormMessage";
import { Overline } from "@/components/ui/Overline";
import { requireUser } from "@/lib/auth/user";
import { bookingReference, bookingStatusBadge, voucherLabel } from "@/lib/booking-rules";
import { getMyBooking } from "@/lib/data/booking";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import type { MyBooking } from "@/types/app";

// A private page: a tab title, and asks Google not to list it.
export const metadata: Metadata = { title: "Review and pay", robots: { index: false } };

// The pay page.
// Takes: params (the booking id from the address) and searchParams
// (?payment=cancelled or ?payment=sent).
// Gives back: the page; everything that needs the login is inside <Suspense>.
export default function PayPage({ params, searchParams }: PageProps<"/book/pay/[bookingId]">) {
  return (
    <Section className="flex flex-col gap-6 pt-6 lg:gap-8 lg:py-12">
      <Suspense fallback={<PayLoading />}>
        <PayStep params={params} searchParams={searchParams} />
      </Suspense>
    </Section>
  );
}

// Loads the booking and picks what to show (see the list at the top).
// Takes: the params and searchParams promises.
// Gives back: the right view for the booking's status. May redirect, or show
// "page not found" for someone else's booking.
async function PayStep({
  params,
  searchParams,
}: Pick<PageProps<"/book/pay/[bookingId]">, "params" | "searchParams">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  const payment = (await searchParams).payment;

  // Logged in and active? (guests -> login page, then back here)
  const user = await requireUser(`/book/pay/${bookingId}`);

  let booking: MyBooking | null;
  let settings;
  try {
    [booking, settings] = await Promise.all([getMyBooking(bookingId), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-muted">
          We couldn&apos;t load your booking right now. Please refresh the page in a moment.
        </p>
      </Card>
    );
  }

  // Not theirs, or doesn't exist: the same "page not found" either way
  if (!booking) notFound();

  // Already paid: the "You're booked" page
  if (booking.status === "confirmed" || booking.status === "attended" || booking.status === "paid_needs_action") {
    redirect(`/book/done/${booking.booking_id}`);
  }

  // Waiting for payment, and the hold is still running: the live pay view
  if (booking.status === "pending_payment" && booking.hold_seconds_left > 0) {
    return (
      <>
        <BookingSteps step={3} title="Review and pay" />
        <PayHold
          secondsLeft={booking.hold_seconds_left}
          holdMinutes={settings.holdMinutes}
          sessionId={booking.session_id}
          bookingId={booking.booking_id}
          total={formatPeso(booking.total)}
          isFree={Number(booking.total) === 0}
          manual={
            settings.manualPaymentEnabled
              ? {
                  userId: user.id,
                  gcashName: settings.gcashName,
                  gcashNumber: settings.gcashNumber,
                  bpiAccountName: settings.bpiAccountName,
                  bpiAccountNumber: settings.bpiAccountNumber,
                }
              : null
          }
          notice={
            payment === "cancelled" ? (
              <FormMessage tone="info">
                You left PayMongo&apos;s page, so nothing was paid. Your seat is still held until the timer ends:
                pay below, or pick another way to pay.
              </FormMessage>
            ) : undefined
          }
        >
          <BookingSummary booking={booking} />
        </PayHold>
      </>
    );
  }

  // The hold ran out without payment: the seat is free again
  if (booking.status === "pending_payment" || booking.status === "expired") {
    return (
      <HoldExpired
        sessionId={booking.session_id}
        bookingId={booking.booking_id}
        holdMinutes={settings.holdMinutes}
        headingLevel="h1"
      />
    );
  }

  // A manual transfer screenshot is being checked (Step 12)
  if (booking.status === "awaiting_verification") {
    return (
      <StatusCard
        icon={<Clock aria-hidden="true" className="size-7" />}
        title="We're checking your payment"
        text={`${payment === "sent" ? "Thanks, your screenshot was sent! " : ""}The cafe will check that your transfer of ${formatPeso(Number(booking.total))} arrived. Your seat stays held while they do. Once it's approved, the booking shows as confirmed in My Bookings. If there's a problem, the cafe will message you.`}
        booking={booking}
      />
    );
  }

  // Cancelled, transferred, forfeited or no-show: nothing to pay here
  return (
    <StatusCard
      icon={<Info aria-hidden="true" className="size-7" />}
      title="This booking is closed"
      text="There's nothing to pay for this booking any more. You can book another class any time."
      booking={booking}
    />
  );
}

// The summary card on the pay page: the class, the extras and the money
// (the amounts book_seat() saved, never worked out again here).
// Takes: the booking.
// Gives back: the card, with the "Change details" button at the bottom.
function BookingSummary({ booking }: { booking: MyBooking }) {
  const date = formatClassDate(booking.class_date);
  // "Iced Matcha · Rented mat" (the drink and the mat choice)
  const extras = [booking.drink_choice, booking.mat_rental ? "Rented mat" : "Own mat"].filter(Boolean).join(" · ");
  const discountLabel = booking.voucher_code
    ? `${booking.voucher_code} (${voucherLabel(booking.voucher_percent_off, booking.voucher_amount_off)})`
    : undefined;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Overline as="h2">Booking {bookingReference(booking.booking_id)}</Overline>
        <Badge variant="warning">Waiting for payment</Badge>
      </div>
      <div>
        <p className="font-semibold text-ink">
          {date.full} · {formatTimeRange(booking.start_time, booking.end_time)}
        </p>
        <p className="text-xs text-muted">{extras}</p>
      </div>
      <PriceSummary
        classFee={booking.class_fee}
        matFee={booking.mat_fee}
        discount={booking.discount}
        discountLabel={discountLabel}
        total={booking.total}
      />
      {/* Gives up this hold and goes back to step 2 with the choices kept */}
      <ChangeDetailsButton bookingId={booking.booking_id} />
    </Card>
  );
}

// A simple card for bookings that can't be paid on this page.
// Takes: an icon, a title, the explanation and the booking.
// Gives back: the card with the class, its status and links onward.
function StatusCard({
  icon,
  title,
  text,
  booking,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  booking: MyBooking;
}) {
  const date = formatClassDate(booking.class_date);
  const badge = bookingStatusBadge(booking.status);
  return (
    <Card className="mb-10 flex max-w-xl flex-col items-start gap-4">
      <span className="flex size-14 items-center justify-center rounded-full bg-tan-soft text-brown">{icon}</span>
      <h1 className="text-2xl font-normal leading-tight">{title}</h1>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          {date.full} · {formatTimeRange(booking.start_time, booking.end_time)}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink href="/account">My account</ButtonLink>
        <ButtonLink href="/book" variant="secondary">
          Book a class
        </ButtonLink>
      </div>
    </Card>
  );
}

// Grey placeholder boxes shown while the booking loads.
// Takes: nothing.
// Gives back: pulsing boxes (screen readers hear "Loading your booking").
function PayLoading() {
  return (
    <div role="status" className="flex flex-col gap-4 lg:max-w-[calc(100%-24.5rem)]">
      <span className="sr-only">Loading your booking…</span>
      <div aria-hidden="true" className="h-1 animate-pulse rounded bg-tan-soft" />
      <div aria-hidden="true" className="h-9 w-56 animate-pulse rounded bg-tan-soft" />
      <div aria-hidden="true" className="h-12 animate-pulse rounded-[14px] bg-tan-soft" />
      <div aria-hidden="true" className="h-52 animate-pulse rounded-[20px] border border-line bg-card" />
    </div>
  );
}
