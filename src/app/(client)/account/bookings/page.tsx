// My Bookings: /account/bookings (Upcoming) and /account/bookings?tab=past
// Where it's used: the account menu, "My Account" in the header (/account
// opens this page), "See my bookings" on the booked page, and after a transfer
// (?moved=<new booking id> shows a "Done" message).
// Layout follows docs/designs/PhoneMyBookings.html.
//
// ONLY THE PERSON'S OWN BOOKINGS: requireUser() checks the login on the
// server, and get_my_bookings() (migration 8) only ever gives back the
// caller's own bookings, even for admins.
//
// LIVE DATA: loaded on every visit, never cached, so statuses, holds and the
// cancel rules are always right now.

import { CalendarPlus, CircleCheck } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { BookingCard } from "@/components/account/BookingCard";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormMessage } from "@/components/ui/FormMessage";
import { Overline } from "@/components/ui/Overline";
import { firstParam } from "@/lib/auth/safe-next";
import { requireUser } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { fillSettings, splitLines } from "@/lib/content-text";
import { getMyBookings } from "@/lib/data/account";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatTime } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { MyBookingListItem } from "@/types/app";

export const metadata = { title: "My Bookings" };

// The My Bookings page.
// Takes: searchParams (?tab=past, ?moved=<id>).
// Gives back: the heading, then the live list inside <Suspense>.
export default function MyBookingsPage({ searchParams }: PageProps<"/account/bookings">) {
  return (
    <>
      <AccountHeading
        title="My Bookings"
        intro="Your classes at the cafe. Transfer or cancel a booking here."
      />
      <Suspense fallback={<AccountLoading label="your bookings" />}>
        <BookingsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part: the tabs and the booking cards.
// Takes: the searchParams promise.
// Gives back: the tabs, a "Done" message after a transfer, the cards (or an
// empty message), and the short cancellation policy.
async function BookingsList({ searchParams }: { searchParams: PageProps<"/account/bookings">["searchParams"] }) {
  const params = await searchParams;
  const tab = firstParam(params.tab) === "past" ? "past" : "upcoming";
  const movedId = firstParam(params.moved);

  await requireUser(tab === "past" ? "/account/bookings?tab=past" : "/account/bookings");

  let bookings: MyBookingListItem[];
  let aboutContent;
  let settings;
  try {
    [bookings, aboutContent, settings] = await Promise.all([
      getMyBookings(),
      getPageContent("about"),
      getPublicSettings(),
    ]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your bookings" />;
  }

  // Read the clock ONCE (we're in a real visit: requireUser has run), so all
  // cards agree on "in 18 hours" etc.
  const nowMs = nowForThisVisit();
  const upcoming = bookings.filter((booking) => booking.is_upcoming); // soonest first
  const past = bookings.filter((booking) => !booking.is_upcoming).reverse(); // most recent first
  const shown = tab === "past" ? past : upcoming;
  // After a transfer: the new booking, to say where it went
  const moved = movedId ? bookings.find((booking) => booking.booking_id === movedId) : undefined;
  const policy = aboutContent.policy_summary;

  return (
    <div className="flex flex-col gap-5">
      {moved && (
        <FormMessage tone="success">
          Done! Your booking is now on {formatClassDate(moved.class_date).full} at {formatTime(moved.start_time)}.
          Same drink and mat, and nothing more to pay.
        </FormMessage>
      )}

      {/* Upcoming / Past tabs. Plain links (?tab=past), so they work without
          JavaScript and the Back button goes to the right tab. */}
      <nav aria-label="Which bookings">
        <ul className="inline-flex rounded-full border border-line bg-white p-1">
          <TabLink href="/account/bookings" active={tab === "upcoming"}>
            Upcoming ({upcoming.length})
          </TabLink>
          <TabLink href="/account/bookings?tab=past" active={tab === "past"}>
            Past ({past.length})
          </TabLink>
        </ul>
      </nav>

      <h2 className="sr-only">{tab === "past" ? "Past bookings" : "Upcoming bookings"}</h2>
      {shown.length > 0 ? (
        // 1 card per row on phones, 2 per row on wide laptops
        <ul className="grid gap-4 xl:grid-cols-2">
          {shown.map((booking) => (
            <BookingCard key={booking.booking_id} booking={booking} nowMs={nowMs} />
          ))}
        </ul>
      ) : (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">
            {tab === "past"
              ? "Your past classes will show here."
              : "You have no upcoming classes. Book one and it will show here."}
          </p>
          {tab === "upcoming" && (
            <ButtonLink href="/book">
              <CalendarPlus aria-hidden="true" className="size-4" />
              Book a class
            </ButtonLink>
          )}
        </Card>
      )}

      {/* The short cancellation policy (about/policy_summary, the same text
          as on About Us), with a link to the full one */}
      {policy?.body && (
        <Card className="flex flex-col gap-3 bg-transparent">
          <Overline as="h2">{policy.title || "Cancelling or moving a class"}</Overline>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {splitLines(fillSettings(policy.body, settings)).map((line) => (
              <li key={line} className="flex gap-2">
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brown" />
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/policies#cancellation"
            className="text-xs font-semibold text-brown underline underline-offset-2"
          >
            Read the full cancellation policy
          </Link>
        </Card>
      )}
    </div>
  );
}

// One tab (Upcoming or Past).
// Takes: where it goes, whether it's the open tab, and its text.
// Gives back: an <li> with the link (the open tab is filled brown).
function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
          active ? "bg-brown text-card" : "text-brown hover:bg-tan-soft",
        )}
      >
        {children}
      </Link>
    </li>
  );
}
