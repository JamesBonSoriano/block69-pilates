// Booking step 2, "Your details": /book/details?session=<class id>
// Where it's used: Continue on step 1, and the class cards on the Home page.
// Layout follows docs/designs/PhoneBook2.html (phone), with a summary card
// on the right on laptops.
//
// What happens here (all on the server, before the form is shown):
//   1. No (or a broken) ?session=  ->  back to step 1.
//   2. Must be logged in (src/proxy.ts checks first, requireUser checks again).
//      Guests go to /login?next=/book/details?session=<id> and come back here.
//   3. Already holding a seat in this class?
//        unpaid hold still running  ->  straight to its pay page (no error)
//        confirmed / attended       ->  a "you're already booked" message
//   4. The class must still be bookable (open, a seat free, before the
//      cutoff). If not, a plain-English message and "Pick another class".
//   5. Coming from "Change details" on the pay page (?from=<old booking>)?
//      Fill the form with that released booking's choices (own bookings only).
//   6. Otherwise: the form (BookingDetailsForm.tsx). Confirm calls holdSeat()
//      (src/lib/booking/actions.ts), which calls book_seat() in the database.

import { CalendarX2, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CheckList } from "@/components/content/ContentText";
import { BookingSteps } from "@/components/booking/BookingSteps";
import { Section } from "@/components/layout/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { firstParam } from "@/lib/auth/safe-next";
import { requireUser } from "@/lib/auth/user";
import { isInNoCreditWindow, NO_CREDIT_HOURS, seatBadge, sessionStateMessage } from "@/lib/booking-rules";
import { fillSettings } from "@/lib/content-text";
import { getPageContent } from "@/lib/data/content";
import {
  checkMyVoucher,
  getMyBooking,
  getMySessionBooking,
  getSessionForBooking,
  type MySessionBooking,
} from "@/lib/data/booking";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatTimeRange } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import { BookingDetailsForm, type KeptChoices } from "./BookingDetailsForm";

// A private page: a tab title, and asks Google not to list it.
export const metadata: Metadata = { title: "Your details", robots: { index: false } };

// The step 2 page.
// Takes: searchParams (?session=<class id>).
// Gives back: the step header, then everything that needs the login or live
// data inside <Suspense>.
export default function BookingDetailsPage({ searchParams }: PageProps<"/book/details">) {
  return (
    <Section className="flex flex-col gap-6 pt-6 lg:gap-8 lg:py-12">
      <BookingSteps step={2} title="Your details" />
      <Suspense fallback={<DetailsLoading />}>
        <DetailsStep searchParams={searchParams} />
      </Suspense>
    </Section>
  );
}

// Works out what to show for this class and this person (see the list at
// the top of the file).
// Takes: the searchParams promise.
// Gives back: the booking form, or a message card. May redirect instead.
async function DetailsStep({ searchParams }: Pick<PageProps<"/book/details">, "searchParams">) {
  const params = await searchParams;
  const sessionId = firstParam(params.session);

  // 1. No class picked (or a broken id): pick one on step 1
  if (!isUuid(sessionId)) {
    redirect("/book");
  }

  // 2. Logged in and active? (guests -> login page, then back here)
  const user = await requireUser(`/book/details?session=${sessionId}`);

  let mine: MySessionBooking | null;
  let session;
  let settings;
  let content;
  try {
    // Load everything at the same time
    [mine, session, settings, content] = await Promise.all([
      getMySessionBooking(sessionId),
      getSessionForBooking(sessionId),
      getPublicSettings(),
      getPageContent("booking"),
    ]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <MessageCard
        title="We couldn't load this class"
        text="Something went wrong on our side. Please refresh the page in a moment."
      />
    );
  }

  // 3. Already holding a seat in this class?
  if (mine?.status === "pending_payment") {
    // An unpaid hold is still running: carry on paying for it
    redirect(`/book/pay/${mine.bookingId}`);
  }
  if (mine) {
    return <AlreadyBooked booking={mine} />;
  }

  // 4. Can this class still be booked?
  if (!session) {
    return (
      <MessageCard
        title="We couldn't find that class"
        text="It may have already happened, or the link is wrong. Please pick a class from the list."
      />
    );
  }
  if (!session.is_bookable) {
    const date = formatClassDate(session.date);
    return (
      <MessageCard
        title={`${date.full} · ${formatTimeRange(session.start_time, session.end_time)}`}
        text={sessionStateMessage(session.state)}
      />
    );
  }

  // 5. Coming back from "Change details" on the pay page? Fill the form with
  //    the choices from the released booking (?from=<old booking id>).
  const kept = await loadKeptChoices(firstParam(params.from), sessionId);

  // 6. The form. Everything it shows comes from the database:
  const date = formatClassDate(session.date);
  const badge = seatBadge(session.seats_left, session.state, session.capacity);
  const whatToBring = content.what_to_bring;

  return (
    <BookingDetailsForm
      session={{
        id: session.session_id,
        dateLabel: date.full,
        timeLabel: formatTimeRange(session.start_time, session.end_time),
        badgeLabel: badge.label,
        badgeVariant: badge.variant,
      }}
      profile={{
        fullName: user.fullName,
        mobile: user.mobile ?? "",
        email: user.email,
        // Shown with the "@" in front (it's saved without it)
        instagram: user.instagram ? `@${user.instagram.replace(/^@/, "")}` : "",
      }}
      classPrice={settings.classPrice}
      matPrice={settings.matPrice}
      drinkOptions={settings.drinkOptions}
      holdMinutes={settings.holdMinutes}
      // "Cancelling now gives no credit" warning (less than 12 hours to go).
      // It reads the clock, which is fine here: requireUser() already waited
      // for a real visit, so this is never frozen into a prebuilt page.
      lateWarning={isInNoCreditWindow(session.date, session.start_time)}
      noCreditHours={NO_CREDIT_HOURS}
      kept={kept}
      // What to bring (site_content booking/what_to_bring), drawn here on the
      // server and handed to the form as a ready-made block
      whatToBring={
        whatToBring?.body ? (
          <Card className="flex flex-col gap-3">
            <Overline as="h2">{fillSettings(whatToBring.title, settings) || "What to bring"}</Overline>
            <CheckList text={fillSettings(whatToBring.body, settings)} className="lg:text-sm" />
          </Card>
        ) : null
      }
    />
  );
}

// Reads the choices from a booking the person just released with "Change
// details", so step 2 can fill them back in.
// Takes: the ?from= value from the address and the class being booked.
// Gives back: the kept choices, or null if there's no (usable) old booking.
// Safety: getMyBooking() only gives back the person's OWN booking, and we
// only use it if it's for this same class and no longer holds a seat
// (released = 'expired', or an unpaid hold whose timer ran out). A made-up
// or someone else's id is simply ignored.
async function loadKeptChoices(fromId: string | undefined, sessionId: string): Promise<KeptChoices | null> {
  if (!isUuid(fromId)) return null;
  const old = await getMyBooking(fromId).catch((error) => {
    unstable_rethrow(error);
    console.error(error);
    return null; // not worth stopping the booking over: start with an empty form
  });
  const holdEnded =
    old?.status === "expired" || (old?.status === "pending_payment" && old.hold_seconds_left === 0);
  if (!old || old.session_id !== sessionId || !holdEnded) return null;

  // The voucher is only kept if it still works right now (someone may have
  // used its last use, or it may have expired, since the hold was made)
  const voucher = old.voucher_code ? await checkMyVoucher(old.voucher_code) : null;

  return {
    drinkChoice: old.drink_choice ?? "",
    matRental: old.mat_rental,
    firstTime: old.first_time,
    healthNotes: old.health_notes ?? "",
    voucher,
  };
}

// Shown when the person already has a paid seat (or a transfer being
// checked) in this class.
// Takes: their booking for the class.
// Gives back: a card with a link to the booking.
function AlreadyBooked({ booking }: { booking: MySessionBooking }) {
  const isChecking = booking.status === "awaiting_verification";
  return (
    <Card className="flex max-w-xl flex-col items-start gap-4">
      <CircleCheck aria-hidden="true" className="size-8 text-success" />
      <h2 className="text-xl font-semibold">You&apos;re already booked in this class</h2>
      <p className="text-sm leading-relaxed text-muted">
        {isChecking
          ? "We're still checking your payment for this class. We'll confirm your seat as soon as it's checked."
          : "You already have a seat in this class, so there's nothing more to do. Each person books their own seat, so a friend can book with their own account."}
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {!isChecking && <ButtonLink href={`/book/done/${booking.bookingId}`}>See my booking</ButtonLink>}
        <ButtonLink href="/book" variant="secondary">
          Book another class
        </ButtonLink>
      </div>
    </Card>
  );
}

// A card explaining why this class can't be booked, with a way back.
// Takes: a title and the explanation.
// Gives back: the card with a "Pick another class" button.
function MessageCard({ title, text }: { title: string; text: string }) {
  return (
    <Card className="mb-10 flex max-w-xl flex-col items-start gap-4">
      <CalendarX2 aria-hidden="true" className="size-8 text-brown" />
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
      <ButtonLink href="/book" className="max-sm:w-full">
        Pick another class
      </ButtonLink>
    </Card>
  );
}

// Grey placeholder boxes shown while the page checks the login and the class.
// Takes: nothing.
// Gives back: pulsing boxes the shape of the form (screen readers hear "Loading").
function DetailsLoading() {
  return (
    <div role="status" className="flex flex-col gap-4 lg:max-w-[calc(100%-24.5rem)]">
      <span className="sr-only">Loading your details…</span>
      <div aria-hidden="true" className="h-20 animate-pulse rounded-[20px] border border-line bg-card" />
      {[1, 2, 3].map((n) => (
        <div key={n} aria-hidden="true" className="flex animate-pulse flex-col gap-2">
          <div className="h-3 w-24 rounded bg-tan-soft" />
          <div className="h-12 rounded-xl bg-tan-soft" />
        </div>
      ))}
    </div>
  );
}
