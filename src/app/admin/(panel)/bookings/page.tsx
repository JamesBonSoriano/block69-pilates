// The admin Bookings list: /admin/bookings
// Where it's used: the admin menu and tab bar, the Dashboard's Bookings card.
// Version 1.4: no Attendance list / Walk-in buttons.
// Version 1.5: "Needs action" also lists bookings still confirmed after their
// class ended ("Pending Attendance Verification"), Attended and No-show have
// their own chips (Forfeited is only real forfeits), and the list has pages
// of 10.
// Layout follows docs/designs/AdminBookings.html and PhoneAdminBookings.html.
//
// Filters live in the address, e.g.
//   /admin/bookings?status=needs_action
//   /admin/bookings?q=ana&when=past&page=2
//   /admin/bookings?date=2026-10-24&time=09:00:00
// The database does the filtering, searching and paging
// (admin_search_bookings, migrations 9 and 22). Without a status filter,
// abandoned unpaid holds ("Expired") are hidden, because "Change details" and
// closed tabs make lots of them. A new search or chip goes back to page 1.
//
// LIVE DATA: loaded on every visit, never cached.
// Protection: proxy + requireAdmin() + the database's own admin check.

import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminBookingList } from "@/components/admin/AdminBookingList";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { BookingFilters, bookingsHref, type BookingFilterValues } from "@/components/admin/BookingFilters";
import { STATUS_CHIPS } from "@/lib/admin/display";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { searchAdminBookings } from "@/lib/data/admin";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { formatTime } from "@/lib/format";
import type { AdminBookingListItem } from "@/types/app";

export const metadata: Metadata = { title: "Bookings · Admin" };

// Bookings per page (Version 1.5, the same as the other admin tables).
const PER_PAGE = 10;

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
  const params = await searchParams;
  const values = readFilters(params);
  const chip = STATUS_CHIPS.find((item) => item.key === values.status) ?? STATUS_CHIPS[0];
  // Which page (?page=2); anything else = page 1
  const pageParam = Number(firstParam(params.page));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  // The same filters for every page; only where to start changes
  const filters = {
    search: values.q,
    statuses: chip.statuses,
    date: values.date,
    startTime: values.time,
    when: values.when,
  };

  let result: { rows: AdminBookingListItem[]; totalMatches: number };
  let schedule;
  try {
    [result, schedule] = await Promise.all([
      // Only this page's bookings are loaded (the database skips the rest)
      searchAdminBookings({ ...filters, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
      getWeeklySchedule(),
    ]);
    // A page past the end (e.g. after marking the last one): get the real
    // count, so the page numbers still show and "Go to page 1" works
    if (result.rows.length === 0 && page > 1) {
      result = { rows: [], totalMatches: (await searchAdminBookings({ ...filters, limit: 1 })).totalMatches };
    }
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
  const summary = `${totalMatches} booking${totalMatches === 1 ? "" : "s"}`;

  // The address of another page, keeping the search, chip and filters.
  // Takes: the page number. Gives back: e.g. "/admin/bookings?status=attended&page=2".
  const hrefFor = (n: number) => {
    const base = bookingsHref(values);
    if (n <= 1) return base;
    return `${base}${base.includes("?") ? "&" : "?"}page=${n}`;
  };

  return (
    <>
      <BookingFilters values={values} timeOptions={timeOptions} summary={summary} />
      {rows.length === 0 && totalMatches > 0 ? (
        // Past the last page
        <AdminCard className="text-sm text-muted">
          This page is empty.{" "}
          <Link href={hrefFor(1)} className="font-semibold text-brown underline underline-offset-2">
            Go to page 1
          </Link>
        </AdminCard>
      ) : (
        <AdminBookingList bookings={rows} />
      )}
      {/* Page numbers (Version 1.5): "Showing 11–20 of 34 bookings" */}
      {totalMatches > 0 && (
        <AdminCard className="p-0 lg:p-0">
          <AdminPagination
            page={page}
            perPage={PER_PAGE}
            total={totalMatches}
            noun={totalMatches === 1 ? "booking" : "bookings"}
            label="Bookings pages"
            hrefFor={hrefFor}
          />
        </AdminCard>
      )}
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
