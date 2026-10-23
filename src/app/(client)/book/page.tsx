// Booking step 1, "Pick a class": /book
// Where it's used: "Book a Class" in the header, every "Book a class" button
// on Home and About Us, and "Pick a class" / "Change" on step 2
// (/book?session=<id>&mat=yes picks that class and the mat tick again).
// Layout follows docs/designs/PhoneBook1.html, changed by Revisions part 1,
// item 4: the classes for each day (no date chips any more), and the
// "Booking details" card (Date, Session, What to bring with the Rent a mat
// tick, Proceed to payment). On phones that card is the sticky bottom bar,
// and "What to bring" is listed under the classes.
//
// GUESTS CAN LOOK: anyone can see the classes and seats left. Continue opens
// step 2 (/book/details?session=<id>), which needs a login: src/proxy.ts
// sends guests to /login?next=/book/details?session=<id>, and after logging
// in (or signing up) they come straight back to the same class.
// Admins can't book: a logged-in admin is sent to /admin (src/proxy.ts first,
// then sendAdminsAway() below).
//
// LIVE DATA: the class list comes from get_open_sessions() on every visit,
// never cached (src/lib/data/booking.ts), so seats left are always real.
// Full, closed, cancelled and past-the-cutoff classes are shown greyed out
// and can't be picked. (book_seat() checks again anyway.)
//
// It works without JavaScript too: it's a normal form with radio buttons and
// a tick box that sends ?session=<id> (and &mat=yes) to step 2.

import Form from "next/form";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { CheckList } from "@/components/content/ContentText";
import { BookingDetailsCard } from "@/components/booking/BookingDetailsCard";
import { BookingColumns } from "@/components/booking/BookingLayout";
import { BookingSteps } from "@/components/booking/BookingSteps";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { firstParam } from "@/lib/auth/safe-next";
import { sendAdminsAway } from "@/lib/auth/user";
import { seatBadge } from "@/lib/booking-rules";
import { fillSettings, splitLines } from "@/lib/content-text";
import { getBookingSessions } from "@/lib/data/booking";
import { getPageContent } from "@/lib/data/content";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatTime, formatTimeRange, formatWeekdays } from "@/lib/format";
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
// Takes: searchParams (?session=<id> picks that class, if it can still be
// booked; ?mat=yes ticks Rent a mat).
// Gives back: the step header (with the cutoff time and class days from the
// database), then the live class picker inside <Suspense>.
export default async function BookPage({ searchParams }: PageProps<"/book">) {
  // Cached data (the same for everyone), loaded at the same time
  const [settings, schedule, content] = await Promise.all([
    getPublicSettings(),
    getWeeklySchedule(),
    getPageContent("booking"),
  ]);
  const classDays = formatWeekdays(schedule.map((day) => day.weekday));
  // What to bring (site_content booking/what_to_bring): one item per line,
  // with {fill-in} words like {mat_price} swapped for the settings values
  const whatToBring = splitLines(fillSettings(content.what_to_bring?.body, settings));

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
        <SessionPicker
          searchParams={searchParams}
          classPrice={settings.classPrice}
          matPrice={settings.matPrice}
          whatToBring={whatToBring}
          whatToBringTitle={fillSettings(content.what_to_bring?.title, settings) || "What to bring"}
        />
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
// Takes: the searchParams promise, the class and mat prices (from settings)
// and the "What to bring" list and its title.
// Gives back: the form with the days and their classes, and the Booking
// details card. Or a message if there are no classes or the database
// couldn't be reached.
async function SessionPicker({
  searchParams,
  classPrice,
  matPrice,
  whatToBring,
  whatToBringTitle,
}: {
  searchParams: PageProps<"/book">["searchParams"];
  classPrice: number;
  matPrice: number;
  whatToBring: string[];
  whatToBringTitle: string;
}) {
  const params = await searchParams;
  const picked = firstParam(params.session);
  // Back from step 2 with the mat ticked: tick it again
  const matTicked = firstParam(params.mat) === "yes";

  // Admin accounts don't book (they use the admin Walk-in page instead)
  await sendAdminsAway();

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
  // Date and time of every class that can be picked, ready for the card
  const sessionLabels = Object.fromEntries(
    sessions
      .filter((session) => session.is_bookable)
      .map((session) => [
        session.session_id,
        { date: formatClassDate(session.date).full, time: formatTimeRange(session.start_time, session.end_time) },
      ]),
  );

  return (
    // next/form's <Form>: a normal GET form (it adds ?session=<id> to the
    // address), but it opens step 2 without reloading the whole site.
    <Form action="/book/details">
      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-5">
          {/* The days: 1 per row on phones, 2 per row from tablet width */}
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

          {/* Phones: what to bring, under the classes (on laptops it's in
              the Booking details card, with the Rent a mat tick) */}
          {whatToBring.length > 0 && (
            <Card className="flex flex-col gap-3 lg:hidden">
              <Overline as="h2">{whatToBringTitle}</Overline>
              <CheckList text={whatToBring.join("\n")} />
              <p className="text-xs text-muted">You can rent a mat in the bar at the bottom of the screen.</p>
            </Card>
          )}
        </div>

        {/* Booking details: sticky bar (phone) / card (laptop) */}
        <BookingDetailsCard
          sessions={sessionLabels}
          initialSessionId={preselected ?? null}
          initialMat={matTicked}
          items={whatToBring}
          classPrice={classPrice}
          matPrice={matPrice}
          canBook={anyBookable}
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
