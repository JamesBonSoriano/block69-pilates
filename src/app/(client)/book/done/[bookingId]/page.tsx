// "You're booked!": /book/done/<booking id>
// Where it's used: the pay page sends paid bookings here, and so does the
// PayMongo return check (/book/pay/<id>/return) after a payment.
// Layout follows docs/designs/PhoneBooked.html (centred on laptops).
//
// ONLY THE BOOKING'S OWNER can open it (same as the pay page: requireClient()
// plus get_my_booking(), which only gives back the caller's own booking).
//
// What it shows, by status:
//   confirmed / attended -> "You're booked!" with the class, extras, payment
//   paid_needs_action    -> "Payment received" (the money arrived, but the
//                           booking needs the cafe: for example it came after
//                           the hold ended and the class filled up, the cafe
//                           cancelled the class, or the amount was different).
//                           The cafe contacts them to move them or sort it out.
//   anything else        -> sent to the pay page, which explains that status

import { Check, CircleAlert, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CheckList } from "@/components/content/ContentText";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { requireClient } from "@/lib/auth/user";
import { bookingReference, bookingStatusBadge, paymentMethodLabel } from "@/lib/booking-rules";
import { fillSettings } from "@/lib/content-text";
import { getMyBooking } from "@/lib/data/booking";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatPeso, formatTime } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import type { MyBooking } from "@/types/app";

// A private page: a tab title, and asks Google not to list it.
export const metadata: Metadata = { title: "You're booked", robots: { index: false } };

// The booked page.
// Takes: params (the booking id from the address).
// Gives back: the page; everything that needs the login is inside <Suspense>.
export default function BookedPage({ params }: PageProps<"/book/done/[bookingId]">) {
  return (
    <Section className="flex flex-col items-center py-10 lg:py-16">
      <Suspense fallback={<BookedLoading />}>
        <Booked params={params} />
      </Suspense>
    </Section>
  );
}

// Loads the booking and shows the confirmation.
// Takes: the params promise.
// Gives back: the confirmation. May redirect, or show "page not found" for
// someone else's booking.
async function Booked({ params }: Pick<PageProps<"/book/done/[bookingId]">, "params">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();

  const user = await requireClient(`/book/done/${bookingId}`);

  let booking: MyBooking | null;
  let settings;
  let content;
  try {
    [booking, settings, content] = await Promise.all([
      getMyBooking(bookingId),
      getPublicSettings(),
      getPageContent("booking"),
    ]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <Card className="w-full max-w-xl">
        <p className="text-sm text-muted">
          We couldn&apos;t load your booking right now. Please refresh the page in a moment.
        </p>
      </Card>
    );
  }

  if (!booking) notFound();

  const needsAction = booking.status === "paid_needs_action";
  // Not paid (yet): the pay page explains what's going on
  if (!needsAction && booking.status !== "confirmed" && booking.status !== "attended") {
    redirect(`/book/pay/${booking.booking_id}`);
  }

  const date = formatClassDate(booking.class_date);
  const badge = bookingStatusBadge(booking.status);
  // "Iced Matcha · Rented mat"
  const extras = [booking.drink_choice, booking.mat_rental ? "Rented mat" : "Own mat"].filter(Boolean).join(" · ");
  const whatToBring = content.what_to_bring;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-5 text-center">
      {/* Big tick (or a warning for "needs action") in a circle */}
      <span
        className={
          needsAction
            ? "flex size-18 items-center justify-center rounded-full bg-warning-bg text-warning"
            : "flex size-18 items-center justify-center rounded-full bg-success-bg text-success"
        }
      >
        {needsAction ? (
          <CircleAlert aria-hidden="true" className="size-8" />
        ) : (
          <Check aria-hidden="true" className="size-8" strokeWidth={2.5} />
        )}
      </span>

      <h1 className="text-[32px] font-normal leading-tight lg:text-4xl">
        {needsAction ? "Payment received" : "You're booked!"}
      </h1>
      <p className="text-sm leading-relaxed text-muted">
        {needsAction ? (
          "We received your payment, but we couldn't confirm your seat automatically (for example, your payment arrived after the seat hold ended and the class filled up). Don't worry, your money is safe: the cafe will contact you to move you to another class or sort it out."
        ) : (
          <>
            See you at the cafe! Your booking is saved under{" "}
            <span className="break-all font-semibold text-ink">{user.email}</span>.
          </>
        )}
      </p>

      {/* The booking card */}
      <Card className="flex w-full flex-col gap-2 text-left text-sm">
        <Overline as="h2">Booking {bookingReference(booking.booking_id)}</Overline>
        <p className="font-heading text-base font-semibold text-brown">
          {date.full} · {formatTime(booking.start_time)}
        </p>
        {extras && <p>{extras}</p>}
        <p className="flex flex-wrap items-center gap-2">
          {booking.paid_amount !== null && booking.paid_method ? (
            <span>
              Paid {formatPeso(booking.paid_amount)} with {paymentMethodLabel(booking.paid_method)}
            </span>
          ) : (
            <span>Total {formatPeso(booking.total)}</span>
          )}
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </p>
        {settings.cafeAddress && (
          <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brown" />
            <span>
              {settings.cafeAddress}
              {settings.mapsUrl && (
                <>
                  {" · "}
                  <a
                    href={settings.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brown underline underline-offset-2"
                  >
                    Open in Google Maps
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              )}
            </span>
          </p>
        )}
      </Card>

      {/* What to bring, from site_content (booking/what_to_bring) */}
      {!needsAction && whatToBring?.body && (
        <Card className="flex w-full flex-col gap-3 text-left">
          <Overline as="h2">{fillSettings(whatToBring.title, settings) || "What to bring"}</Overline>
          <CheckList text={fillSettings(whatToBring.body, settings)} className="lg:text-sm" />
        </Card>
      )}

      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <ButtonLink href="/account/bookings" fullWidth className="sm:flex-1">
          See my bookings
        </ButtonLink>
        <ButtonLink href="/book" variant="secondary" fullWidth className="sm:flex-1">
          Book another class
        </ButtonLink>
      </div>
    </div>
  );
}

// Grey placeholder shapes shown while the booking loads.
// Takes: nothing.
// Gives back: a pulsing circle, title and card (screen readers hear "Loading").
function BookedLoading() {
  return (
    <div role="status" className="flex w-full max-w-xl flex-col items-center gap-5">
      <span className="sr-only">Loading your booking…</span>
      <div aria-hidden="true" className="size-18 animate-pulse rounded-full bg-tan-soft" />
      <div aria-hidden="true" className="h-9 w-56 animate-pulse rounded bg-tan-soft" />
      <div aria-hidden="true" className="h-44 w-full animate-pulse rounded-[20px] border border-line bg-card" />
    </div>
  );
}
