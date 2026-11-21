// My Bookings: /account/bookings (Upcoming) and /account/bookings?tab=past
// Where it's used: the account menu, "My Account" in the header (/account
// opens this page), "See my bookings" on the booked page, and after a transfer
// (?moved=<new booking id> shows a "Done" message).
// Layout follows docs/designs/PhoneMyBookings.html.
//
// ONLY THE PERSON'S OWN BOOKINGS: requireClient() checks the login on the
// server, and get_my_bookings() (migration 8) only ever gives back the
// caller's own bookings, even for admins.
//
// LIVE DATA: loaded on every visit, never cached, so statuses, holds and the
// cancel rules are always right now.

import { CalendarPlus, CircleCheck } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  AccountHeading,
  AccountLoadError,
  AccountLoading,
} from "@/components/account/AccountHeading";
import { PolicyDialogLink } from "@/components/booking/PolicyDialog";
import { Badge } from "@/components/ui/Badge";
import { bookingReference } from "@/lib/booking-rules";
import { BookingCard, clientBookingBadge } from "@/components/account/BookingCard";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormMessage } from "@/components/ui/FormMessage";
import { Overline } from "@/components/ui/Overline";
import { firstParam } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { fillSettings, splitLines } from "@/lib/content-text";
import { getMyBookingListItem, getMyBookingPage, getMyBookingReceiptId, getMyCafeCancellations } from "@/lib/data/account";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatTime, formatTimeRange } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { MyBookingListItem, MyCafeCancellation } from "@/types/app";

// Five compact rows keep the booking history easy to scan on a phone.
const BOOKING_PAGE_SIZE = 5;

export const metadata = { title: "My Bookings" };

// The My Bookings page.
// Takes: searchParams (?tab=past, ?moved=<id>).
// Gives back: the heading, then the live list inside <Suspense>.
export default function MyBookingsPage({
  searchParams,
}: PageProps<"/account/bookings">) {
  return (
    <>
      <AccountHeading
        title="My Bookings"
        intro="Your classes at the cafe. Re-schedule or cancel a booking here."
      />
      <Suspense fallback={<AccountLoading label="your bookings" />}>
        <BookingsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Loads the client's booking table and the selected detail or management view.
// Takes: the searchParams promise.
// Gives back: the tabs, a "Done" message after a transfer, the table (or an
// empty message), and the short cancellation policy.
async function BookingsList({
  searchParams,
}: {
  searchParams: PageProps<"/account/bookings">["searchParams"];
}) {
  const params = await searchParams;
  const tab = firstParam(params.tab) === "past" ? "past" : "upcoming";
  const movedId = firstParam(params.moved);
  const manageId = firstParam(params.manage);
  const viewId = firstParam(params.view);
  const pageParam = Number(firstParam(params.page));

  await requireClient(
    tab === "past" ? "/account/bookings?tab=past" : "/account/bookings",
  );

  let shown: MyBookingListItem[];
  let selected: MyBookingListItem | null;
  let moved: MyBookingListItem | null;
  let receiptId: string | null;
  let upcomingCount: number;
  let pastCount: number;
  let page: number;
  let aboutContent;
  let settings;
  let cafeCancels: MyCafeCancellation[]; // Version 1.7: bookings the cafe cancelled
  try {
    // Query both tab counts, then load the requested page and owned details.
    const [upcoming, past, detail, move, content, publicSettings, cancels] = await Promise.all([
      getMyBookingPage(true, 1, BOOKING_PAGE_SIZE),
      getMyBookingPage(false, 1, BOOKING_PAGE_SIZE),
      getMyBookingListItem(manageId ?? viewId),
      getMyBookingListItem(movedId),
      getPageContent("about"),
      getPublicSettings(),
      getMyCafeCancellations(),
    ]);
    const first = tab === "past" ? past : upcoming;
    const lastPage = Math.max(1, Math.ceil(first.count / BOOKING_PAGE_SIZE));
    page = Number.isSafeInteger(pageParam) ? Math.min(Math.max(1, pageParam), lastPage) : 1;
    shown = page === 1 ? first.rows : (await getMyBookingPage(tab === "upcoming", page, BOOKING_PAGE_SIZE)).rows;
    upcomingCount = upcoming.count;
    pastCount = past.count;
    selected = detail;
    moved = move;
    aboutContent = content;
    settings = publicSettings;
    cafeCancels = cancels;
    receiptId = selected?.paid_amount != null && !manageId ? await getMyBookingReceiptId(selected.booking_id) : null;
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your bookings" />;
  }

  // Keep the active tab and page when opening and closing a booking.
  const base = new URLSearchParams();
  if (tab === "past") base.set("tab", tab);
  const hrefFor = (pageNumber: number, action?: "view" | "manage", bookingId?: string) => {
    const query = new URLSearchParams(base);
    if (pageNumber > 1) query.set("page", String(pageNumber));
    if (action && bookingId) query.set(action, bookingId);
    const search = query.toString();
    return search ? `/account/bookings?${search}` : "/account/bookings";
  };
  const total = tab === "past" ? pastCount : upcomingCount;
  const policy = aboutContent.policy_summary;
  const cancelByBooking = new Map(cafeCancels.map((cancel) => [cancel.booking_id, cancel]));


  return (
    <div className="flex flex-col gap-5">
      {moved && (
        <FormMessage tone="success">
          Done! Your booking is now on {formatClassDate(moved.class_date).full}{" "}
          at {formatTime(moved.start_time)}. Same drink and mat, and nothing
          more to pay.
        </FormMessage>
      )}

      {/* Upcoming / Past tabs. Plain links (?tab=past), so they work without
          JavaScript and the Back button goes to the right tab. */}
      <nav aria-label="Which bookings">
        <ul className="inline-flex rounded-full border border-line bg-white p-1">
          <TabLink href="/account/bookings" active={tab === "upcoming"}>
            Upcoming ({upcomingCount})
          </TabLink>
          <TabLink href="/account/bookings?tab=past" active={tab === "past"}>
            Past ({pastCount})
          </TabLink>
        </ul>
      </nav>

      {/* The detail links use owned booking IDs and leave the list page intact. */}
      {selected && (
        <section aria-label={manageId ? "Manage booking" : "Booking details"} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg">{manageId ? "Manage booking" : "Booking details"}</h2>
            <ButtonLink href={hrefFor(page)} variant="secondary">Close</ButtonLink>
          </div>
          <BookingCard
            booking={selected}
            nowMs={nowForThisVisit()}
            manage={Boolean(manageId)}
            receiptId={receiptId}
            cafeCancel={cancelByBooking.get(selected.booking_id)}
          />
        </section>
      )}
      {shown.length > 0 ? (
        <Card className="overflow-x-auto p-0 lg:p-0">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{tab === "past" ? "Past bookings" : "Upcoming bookings"}</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr><th scope="col" className="p-3">Class</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {shown.map((booking) => {
                const badge = clientBookingBadge(booking, cancelByBooking.get(booking.booking_id));
                const reference = bookingReference(booking.booking_id);
                return (
                  <tr key={booking.booking_id} className="border-b border-line last:border-0">
                    <th scope="row" className="p-3 font-normal">
                      <span className="block font-semibold">{formatClassDate(booking.class_date).short}</span>
                      <span className="block text-xs">{formatTimeRange(booking.start_time, booking.end_time)}</span>
                      <span className="block text-xs text-muted">{reference}</span>
                    </th>
                    <td className="p-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-x-3">
                        <Link href={hrefFor(page, "view", booking.booking_id)} aria-label={`View ${reference}`} className="inline-flex min-h-11 items-center font-semibold underline">View</Link>
                        {canManageBooking(booking) && (
                          <Link href={hrefFor(page, "manage", booking.booking_id)} aria-label={`Manage ${reference}`} className="inline-flex min-h-11 items-center font-semibold underline">Manage</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <nav aria-label="Booking pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3 text-xs">
            <p>Showing {(page - 1) * BOOKING_PAGE_SIZE + 1}–{Math.min(page * BOOKING_PAGE_SIZE, total)} of {total}</p>
            <div className="flex gap-3">
              {page > 1 && <ButtonLink href={hrefFor(page - 1)} variant="secondary">Previous</ButtonLink>}
              {page * BOOKING_PAGE_SIZE < total && <ButtonLink href={hrefFor(page + 1)} variant="secondary">Next</ButtonLink>}
            </div>
          </nav>
        </Card>
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
          <Overline as="h2">
            {policy.title || "Cancelling or moving a class"}
          </Overline>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {splitLines(fillSettings(policy.body, settings)).map((line) => (
              <li key={line} className="flex gap-2">
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brown"
                />
                {line}
              </li>
            ))}
          </ul>
          <PolicyDialogLink
            section="cancellation"
            className="text-xs font-semibold text-brown underline underline-offset-2"
          >
            Read the full cancellation policy
          </PolicyDialogLink>
        </Card>
      )}
    </div>
  );
}

// One tab (Upcoming or Past).
// Takes: where it goes, whether it's the open tab, and its text.
// Gives back: an <li> with the link (the open tab is filled brown).
function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
          active
            ? "bg-primary text-on-primary"
            : "text-brown hover:bg-tan-soft",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

// Shows Manage for bookings with a current payment, retry, cancellation, or move action.
function canManageBooking(booking: MyBookingListItem): boolean {
  return booking.can_transfer
    || (booking.is_upcoming && booking.payment_rejected)
    || (booking.status === "pending_payment" && booking.hold_seconds_left > 0 && booking.session_status !== "cancelled")
    || (booking.status === "confirmed" && booking.change_rule !== null
      && !["free_transfer", "move_window_ended", "started"].includes(booking.change_rule));
}
