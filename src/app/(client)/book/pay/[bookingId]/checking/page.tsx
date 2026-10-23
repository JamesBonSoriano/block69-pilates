// "Checking your payment…": /book/pay/<booking id>/checking
// Where it's used: the return route (./../return/route.ts) sends the client
// here when PayMongo doesn't show a paid payment for the booking (yet). For
// example GCash can take a few seconds to tell PayMongo, or the client
// closed PayMongo's page without paying.
//
// It shows:
//   - "Check again" -> the return route asks PayMongo again
//   - "Back to payment" -> the pay page (still held: pay again or pick
//     another method; hold ended: "Your seat was released")
// If the booking got confirmed in the meantime (by the webhook), it goes
// straight to the "You're booked" page.
//
// ONLY THE BOOKING'S OWNER: requireUser() + get_my_booking() (others get
// "page not found").

import { Clock, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { Section } from "@/components/layout/Section";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormMessage } from "@/components/ui/FormMessage";
import { requireUser } from "@/lib/auth/user";
import { bookingReference } from "@/lib/booking-rules";
import { getMyBooking } from "@/lib/data/booking";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import type { MyBooking } from "@/types/app";

// A private page: a tab title, and asks Google not to list it.
export const metadata: Metadata = { title: "Checking your payment", robots: { index: false } };

// The page.
// Takes: params (the booking id) and searchParams (?problem=1 when PayMongo
// couldn't be reached).
// Gives back: the page; the logged-in part is inside <Suspense>.
export default function CheckingPage({ params, searchParams }: PageProps<"/book/pay/[bookingId]/checking">) {
  return (
    <Section className="flex flex-col items-center py-10 lg:py-16">
      <Suspense fallback={<p className="text-sm text-muted">Checking your payment…</p>}>
        <Checking params={params} searchParams={searchParams} />
      </Suspense>
    </Section>
  );
}

// Loads the booking and shows the card.
// Takes: the params and searchParams promises.
// Gives back: the "checking" card. May redirect, or show "page not found".
async function Checking({
  params,
  searchParams,
}: Pick<PageProps<"/book/pay/[bookingId]/checking">, "params" | "searchParams">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  const problem = (await searchParams).problem === "1";

  await requireUser(`/book/pay/${bookingId}/checking`);

  let booking: MyBooking | null;
  try {
    booking = await getMyBooking(bookingId);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <Card className="w-full max-w-xl text-sm text-muted">
        We couldn&apos;t load your booking right now. Please refresh the page in a moment.
      </Card>
    );
  }
  if (!booking) notFound();

  // Confirmed in the meantime (for example by the webhook): all done
  if (booking.status === "confirmed" || booking.status === "attended" || booking.status === "paid_needs_action") {
    redirect(`/book/done/${bookingId}`);
  }

  return (
    <Card className="flex w-full max-w-xl flex-col items-start gap-4">
      <span className="flex size-14 items-center justify-center rounded-full bg-info-bg text-info">
        <Clock aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-normal leading-tight">Checking your payment…</h1>
      <p className="text-sm leading-relaxed text-muted">
        We haven&apos;t received your payment from PayMongo yet. GCash and Maya can take a few seconds, so tap{" "}
        <span className="font-semibold text-ink">Check again</span>. If you closed PayMongo&apos;s page without
        paying, go back to the payment page to try again.
      </p>
      {problem && (
        <FormMessage tone="error">
          We couldn&apos;t reach PayMongo just now. If you paid, nothing is lost: please tap Check again in a moment.
        </FormMessage>
      )}

      <div className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm">
        <p className="font-semibold text-ink">
          {formatClassDate(booking.class_date).full} · {formatTimeRange(booking.start_time, booking.end_time)}
        </p>
        <p className="text-xs text-muted">
          Booking {bookingReference(booking.booking_id)} · Total {formatPeso(Number(booking.total))}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {/* A plain <a> (not next/link): the return check is a route, not a
            page, so the browser should load it fully */}
        <a href={`/book/pay/${bookingId}/return`} className={buttonClasses("primary")}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Check again
        </a>
        <ButtonLink href={`/book/pay/${bookingId}`} variant="secondary">
          Back to payment
        </ButtonLink>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Paid, but this still says checking after a few minutes? Don&apos;t pay again. Message the cafe with your
        booking number and we&apos;ll sort it out.
      </p>
    </Card>
  );
}
