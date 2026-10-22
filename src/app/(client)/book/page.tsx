// Booking step 1, "Pick a class": /book
// Where it's used: "Book a Class" in the header, every "Book a class" button
// on Home and About Us, and "Change" on step 2 (/book?session=<id> picks
// that class again).
// Layout follows docs/designs/PhoneBook1.html: date chips, the classes for
// each day, and a sticky bar with the price and Continue (laptop: a side card).
//
// GUESTS CAN LOOK: anyone can see the classes and seats left. Continue opens
// step 2 (/book/details?session=<id>), which needs a login: src/proxy.ts
// sends guests to /login?next=/book/details?session=<id>, and after logging
// in (or signing up) they come straight back to the same class.
//
// LIVE DATA: the class list comes from get_open_sessions() on every visit,
// never cached (src/lib/data/booking.ts), so seats left are always real.
// Full, closed, cancelled and past-the-cutoff classes are shown greyed out
// and can't be picked. (book_seat() checks again anyway.)
//
// It works without JavaScript too: it's a normal form with radio buttons
// that sends ?session=<id> to step 2.

import Form from "next/form";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { BookingSteps } from "@/components/booking/BookingSteps";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { firstParam } from "@/lib/auth/safe-next";
import { seatBadge } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { getBookingSessions } from "@/lib/data/booking";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatPeso, formatTime, formatTimeRange, formatWeekdays } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import type { OpenSession } from "@/types/app";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "Book a class",
  description:
    "Pick a Mindful Mat Pilates class at Block 69 Cafe, Taguig. See live seats left for the next 4 weeks and book online.",
  path: "/book",
});

// The step 1 page.
// Takes: searchParams (?session=<id> picks that class, if it can still be booked).
// Gives back: the step header (with the cutoff time and class days from the
// database), then the live class picker inside <Suspense>.
export default async function BookPage({ searchParams }: PageProps<"/book">) {
  // Cached data (the same for everyone), loaded at the same time
  const [settings, schedule] = await Promise.all([getPublicSettings(), getWeeklySchedule()]);
  const classDays = formatWeekdays(schedule.map((day) => day.weekday));

  return (
    <Section className="flex flex-col gap-6 pt-6 lg:gap-8 lg:py-12">
      <BookingSteps
        step={1}
        title="Pick a class"
        intro={
          <>
            Online booking for a class closes at {formatTime(settings.cutoffTime)} on class day
            {classDays && <>. Classes run {classDays}</>}.
          </>
        }
      />
      <Suspense fallback={<SessionPickerLoading />}>
        <SessionPicker searchParams={searchParams} classPrice={settings.classPrice} />
      </Suspense>
    </Section>
  );
}

// One day with its classes.
type ClassDay = { date: string; sessions: OpenSession[]; anyBookable: boolean };

// Puts the classes into days.
// Takes: the classes, earliest first (as get_open_sessions gives them).
// Gives back: one entry per date, in the same order.
function groupByDate(sessions: OpenSession[]): ClassDay[] {
  const days: ClassDay[] = [];
  for (const session of sessions) {
    const last = days[days.length - 1];
    if (last && last.date === session.date) {
      last.sessions.push(session);
      last.anyBookable ||= session.is_bookable;
    } else {
      days.push({ date: session.date, sessions: [session], anyBookable: session.is_bookable });
    }
  }
  return days;
}

// The live class picker (runs on every visit, never cached).
// Takes: the searchParams promise and the class price (for the sticky bar).
// Gives back: the form with date chips, the days and their classes, and the
// Continue bar. Or a message if there are no classes or the database
// couldn't be reached.
async function SessionPicker({
  searchParams,
  classPrice,
}: {
  searchParams: PageProps<"/book">["searchParams"];
  classPrice: number;
}) {
  const params = await searchParams;
  const picked = firstParam(params.session);

  let sessions: OpenSession[];
  try {
    sessions = await getBookingSessions();
  } catch (error) {
    // Pass on Next.js's own internal signals, and the dev-mode AbortError
    // (see the same code on the Home page)
    unstable_rethrow(error);
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error);
    return (
      <Card>
        <p className="text-sm text-muted">
          We couldn&apos;t load the classes right now. Please refresh the page in a moment.
        </p>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          There are no classes in the next 4 weeks yet. Check back soon, or message us with Chat
          With Us.
        </p>
      </Card>
    );
  }

  const days = groupByDate(sessions);
  const anyBookable = days.some((day) => day.anyBookable);
  // Only pre-pick the class from the address if it can still be booked
  const preselected = sessions.find((s) => s.session_id === picked && s.is_bookable)?.session_id;

  return (
    // next/form's <Form>: a normal GET form (it adds ?session=<id> to the
    // address), but it opens step 2 without reloading the whole site.
    <Form action="/book/details">
      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-5">
          {/* Date chips: jump links to each day (like the date row in the mockup).
              Phone: one row you can swipe sideways inside its own box, so the
              page itself never scrolls sideways. Laptop: they wrap. */}
          <nav aria-label="Jump to a date">
            <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              {days.map((day) => {
                const date = formatClassDate(day.date);
                return (
                  <li key={day.date} className="shrink-0">
                    <a
                      href={`#day-${day.date}`}
                      className={cn(
                        "flex min-h-11 w-14.5 flex-col items-center justify-center rounded-[14px] border border-line bg-white py-2 text-ink",
                        "hover:border-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                        // Days with nothing left to book are faded
                        !day.anyBookable && "opacity-40",
                      )}
                    >
                      <span className="text-[10px] font-bold">{date.weekday}</span>
                      <span className="font-heading text-xl leading-tight">{date.day}</span>
                      <span className="sr-only">
                        {date.full}
                        {!day.anyBookable && " (nothing left to book)"}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* The days: 1 per row on phones, 2 per row from tablet width */}
          <ul className="grid gap-4 sm:grid-cols-2">
            {days.map((day) => (
              // scroll-mt: leave a little space above the day when a chip jumps to it
              <li key={day.date} id={`day-${day.date}`} className="scroll-mt-4">
                <Card>
                  <RadioGroup legend={formatClassDate(day.date).full} name={`day-${day.date}`} legendStyle="heading">
                    {day.sessions.map((session) => {
                      const badge = seatBadge(session.seats_left, session.state, session.capacity);
                      return (
                        <RadioOption
                          key={session.session_id}
                          // All classes share one name, so only ONE can be picked
                          name="session"
                          value={session.session_id}
                          required
                          disabled={!session.is_bookable}
                          defaultChecked={session.session_id === preselected}
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
        </div>

        <BookingAside
          totalLabel="Class fee"
          total={formatPeso(classPrice)}
          action={
            <Button type="submit" fullWidth disabled={!anyBookable}>
              Continue
            </Button>
          }
          note={
            anyBookable
              ? "Includes an upsized matcha or coffee. Next: your details. You'll need to log in or sign up to book."
              : "Every class in the next 4 weeks is full or closed. Please check back soon."
          }
        />
      </BookingColumns>
    </Form>
  );
}

// Grey placeholder cards shown while the live class list loads.
// Takes: nothing.
// Gives back: pulsing empty day cards (screen readers hear "Loading classes").
function SessionPickerLoading() {
  return (
    <div role="status" className="grid gap-4 sm:grid-cols-2 lg:max-w-[calc(100%-24.5rem)]">
      <span className="sr-only">Loading classes…</span>
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          aria-hidden="true"
          className="flex h-44 animate-pulse flex-col gap-3 rounded-[20px] border border-line bg-card p-4"
        >
          <div className="h-4 w-40 rounded bg-tan-soft" />
          <div className="h-14 rounded-[14px] bg-tan-soft" />
          <div className="h-14 rounded-[14px] bg-tan-soft" />
        </div>
      ))}
    </div>
  );
}
