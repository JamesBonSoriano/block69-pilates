// The admin Bookings list: /admin/bookings
// Where it's used: the admin menu and tab bar, the Dashboard's "All bookings".
// Layout follows docs/designs/AdminBookings.html and PhoneAdminBookings.html.
//
// Filters live in the address, e.g.
//   /admin/bookings?status=needs_action
//   /admin/bookings?q=ana&when=past
//   /admin/bookings?date=2026-10-24&time=09:00:00
// The database does the filtering and searching (admin_search_bookings,
// migration 9). Without a status filter, abandoned unpaid holds ("Expired")
// are hidden, because "Change details" and closed tabs make lots of them.
//
// LIVE DATA: loaded on every visit, never cached.
// Protection: proxy + requireAdmin() + the database's own admin check.

import { ListChecks, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminBookingList } from "@/components/admin/AdminBookingList";
import { AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { BookingFilters, type BookingFilterValues } from "@/components/admin/BookingFilters";
import { ButtonLink } from "@/components/ui/Button";
import { STATUS_CHIPS } from "@/lib/admin/display";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { searchAdminBookings } from "@/lib/data/admin";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { formatTime } from "@/lib/format";
import type { AdminBookingListItem } from "@/types/app";

export const metadata: Metadata = { title: "Bookings · Admin" };

// The most bookings shown at once (the database never gives more than 500).
const LIMIT = 200;

// The Bookings page.
// Takes: searchParams (the filters).
// Gives back: the heading, then the filters and list inside <Suspense>.
export default function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Bookings"
        intro="One row per seat. PayMongo payments confirm on their own."
        actions={
          <>
            <ButtonLink href="/admin/attendance" variant="secondary">
              <ListChecks aria-hidden="true" className="size-4" />
              Attendance list
            </ButtonLink>
            <ButtonLink href="/admin/walk-in">
              <UserPlus aria-hidden="true" className="size-4" />
              Walk-in booking
            </ButtonLink>
          </>
        }
      />
      <Suspense fallback={<AdminLoading label="the bookings" />}>
        <BookingsResults searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: filters + list.
// Takes: the searchParams promise.
// Gives back: the filter area and the matching bookings.
async function BookingsResults({ searchParams }: { searchParams: PageProps<"/admin/bookings">["searchParams"] }) {
  await requireAdmin();
  const values = readFilters(await searchParams);
  const chip = STATUS_CHIPS.find((item) => item.key === values.status) ?? STATUS_CHIPS[0];

  let result: { rows: AdminBookingListItem[]; totalMatches: number };
  let schedule;
  try {
    [result, schedule] = await Promise.all([
      searchAdminBookings({
        search: values.q,
        statuses: chip.statuses,
        date: values.date,
        startTime: values.time,
        when: values.when,
        limit: LIMIT,
      }),
      getWeeklySchedule(),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the bookings" />;
  }

  // The class times to offer: every start time in the weekly schedule (and
  // the one in the address, if it's not one of them)
  const times = new Set(schedule.flatMap((day) => day.slots.map((slot) => slot.startTime)));
  if (values.time) times.add(values.time);
  const timeOptions = [...times].sort().map((time) => ({ value: time, label: formatTime(time) }));

  const { rows, totalMatches } = result;
  const summary =
    totalMatches > rows.length
      ? `${totalMatches} bookings · showing the first ${rows.length}. Narrow the search to see the rest.`
      : `${totalMatches} booking${totalMatches === 1 ? "" : "s"}`;

  return (
    <>
      <BookingFilters values={values} timeOptions={timeOptions} summary={summary} />
      <AdminBookingList bookings={rows} />
    </>
  );
}

// Reads the filters from the address, ignoring anything that isn't valid.
// Takes: the page's searchParams.
// Gives back: clean filter values (unknown status -> "all", bad date -> "").
function readFilters(params: Record<string, string | string[] | undefined>): BookingFilterValues {
  const q = (firstParam(params.q) ?? "").trim().slice(0, 100);
  const status = firstParam(params.status) ?? "all";
  const date = firstParam(params.date) ?? "";
  const time = firstParam(params.time) ?? "";
  const when = firstParam(params.when);
  return {
    q,
    status: STATUS_CHIPS.some((chip) => chip.key === status) ? status : "all",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    // "09:00" or "09:00:00"
    time: /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? time : "",
    // Default: today and later, or all dates when searching for someone
    when: when === "upcoming" || when === "past" || when === "all" ? when : q ? "all" : "upcoming",
  };
}
