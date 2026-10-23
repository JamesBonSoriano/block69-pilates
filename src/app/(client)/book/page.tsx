// Booking step 1, "Pick a class": /book
// Where it's used: "Book a Class" in the header, every "Book Your Session"
// button on Home and About Us, and "Pick a class" / "Change" on step 2
// (/book?session=<id>&mat=yes picks that class and the mat tick again).
// Layout (Change 17, Part F, like the reference design): a MONTH NAVIGATOR
// (◀ October 2026 ▶, this month and next month only), a row of DATE CHIPS
// for the dates that have classes, and the picked date's classes under them
// (ClassDayPicker). Plus the "Booking details" card (Date, Session, What to
// bring with the Rent a mat tick, Proceed to payment). On phones that card is
// the sticky bottom bar, and "What to bring" is listed under the classes.
// The class days come from the dated classes (made from schedule_templates),
// never typed in here.
//
// The address can carry: ?session=<id> (a picked class), ?mat=yes,
// ?show_month=YYYY-MM or ?month=YYYY-MM (the month to show), ?date=YYYY-MM-DD
// (the date chip to show). The last three are only for when JavaScript
// hasn't loaded (see ClassDayPicker.tsx).
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
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckList } from "@/components/content/ContentText";
import { BookingDetailsCard } from "@/components/booking/BookingDetailsCard";
import { BookingColumns } from "@/components/booking/BookingLayout";
import { BookingSteps } from "@/components/booking/BookingSteps";
import { ClassDayPicker } from "@/components/booking/ClassDayPicker";
import { Section } from "@/components/layout/Section";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { firstParam } from "@/lib/auth/safe-next";
import { sendAdminsAway } from "@/lib/auth/user";
import { buildClassPicker } from "@/lib/booking/class-picker";
import { fillSettings, splitLines } from "@/lib/content-text";
import { getBookingSessions } from "@/lib/data/booking";
import { getPageContent } from "@/lib/data/content";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatTime, formatTimeRange, formatWeekdays, manilaDateString } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { bookableMonths, monthRange } from "@/lib/month";
import { nowForThisVisit } from "@/lib/server-clock";
import type { OpenSession } from "@/types/app";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "Book a class",
  description:
    "Pick a Mindful Mat Pilates class at Block 69 Cafe, Taguig. See live seats left for this month and next month and book online.",
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

// The live class picker (runs on every visit, never cached).
// Takes: the searchParams promise, the class and mat prices (from settings)
// and the "What to bring" list and its title.
// Gives back: the form with the month navigator, the date chips, the picked
// date's classes and the Booking details card. Or a message if the database
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

  // Today in the Philippines, and the two months that can be booked
  // (connection() = a real visit, so reading the clock here is fine)
  await connection();
  const today = manilaDateString(nowForThisVisit());
  const months = bookableMonths(today);

  let sessions: OpenSession[];
  try {
    // Both months in one go: today to the end of next month
    sessions = await getBookingSessions({ from: today, to: monthRange(months[1]).last });
  } catch (error) {
    // Next.js uses special "errors" internally to pause rendering until a
    // visitor arrives. Those must be passed on, not treated as real errors.
    unstable_rethrow(error);
    // In dev mode, Next.js also runs an extra "practice" render of the page
    // and stops it early. Stopping it cancels our database call with an
    // "AbortError". That isn't a real problem (the visitor's own render
    // still loads the classes), so pass it on quietly instead of logging it.
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

  // Which month and date to show, and the chips and classes for it
  // (src/lib/booking/class-picker.ts)
  const picker = buildClassPicker({
    sessions,
    months,
    askedMonth: firstParam(params.show_month) ?? firstParam(params.month),
    askedDate: firstParam(params.date),
    pickedSessionId: picked,
  });
  const anyBookable = picker.days.some((day) => day.anyBookable);
  // Date and time of every class in this month that can be picked, for the card
  const sessionLabels = Object.fromEntries(
    sessions
      .filter((session) => session.is_bookable && picker.monthSessionIds.has(session.session_id))
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
          <ClassDayPicker
            months={picker.months}
            days={picker.days}
            initialDate={picker.initialDate}
            initialSessionId={picker.preselectedId}
            radioName="session"
            reloadAction="/book"
            emptyText={`There are no classes in ${picker.months.label} yet. Try the other month, or message us with Chat With Us.`}
          />

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
          initialSessionId={picker.preselectedId}
          initialMat={matTicked}
          items={whatToBring}
          classPrice={classPrice}
          matPrice={matPrice}
          canBook={anyBookable}
          note={
            anyBookable
              ? "Includes an upsized matcha or coffee. Next: your details. You'll need to log in or sign up to book."
              : `Every class in ${picker.months.label} is full or closed. Try the other month, or check back soon.`
          }
        />
      </BookingColumns>
    </Form>
  );
}

// Grey placeholders shown while the live class list loads.
// Takes: nothing.
// Gives back: a pulsing month bar, chips and a class card (screen readers
// hear "Loading classes").
function SessionPickerLoading() {
  return (
    <div role="status" className="flex flex-col gap-5 lg:max-w-[calc(100%-24.5rem)]">
      <span className="sr-only">Loading classes…</span>
      <div aria-hidden="true" className="h-13 animate-pulse rounded-full border border-line bg-card" />
      <div aria-hidden="true" className="flex gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-16 w-16 animate-pulse rounded-2xl bg-tan-soft" />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex h-44 animate-pulse flex-col gap-3 rounded-[20px] border border-line bg-card p-4"
      >
        <div className="h-4 w-40 rounded bg-tan-soft" />
        <div className="h-14 rounded-[14px] bg-tan-soft" />
        <div className="h-14 rounded-[14px] bg-tan-soft" />
      </div>
    </div>
  );
}
