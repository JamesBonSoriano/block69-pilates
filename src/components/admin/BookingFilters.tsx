// The filters on the admin Bookings page: status chips, search box, class
// date, class time and "show upcoming / past / all".
// Where it's used: src/app/admin/bookings/page.tsx.
// Layout follows docs/designs/AdminBookings.html (chips, then the search row)
// and PhoneAdminBookings.html (chips you can swipe sideways).
//
// It's a normal GET form (next/form), so the filters live in the address:
// they work before JavaScript loads, the Back button works, and a filtered
// list can be bookmarked. The chips are plain links that keep the other filters.

import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { STATUS_CHIPS } from "@/lib/admin/display";
import { cn } from "@/lib/cn";

// The filters as they are in the address right now.
export type BookingFilterValues = {
  q: string; // search text ("" = none)
  status: string; // a STATUS_CHIPS key, e.g. "all" or "needs_action"
  date: string; // "YYYY-MM-DD" or ""
  time: string; // "09:00:00" or ""
  when: "upcoming" | "past" | "all";
};

// Builds the Bookings address for a set of filters, leaving out empty ones
// and the defaults, e.g. "/admin/bookings?status=confirmed&q=ana".
// Takes: the filters. Gives back: the address.
export function bookingsHref(values: BookingFilterValues): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status !== "all") params.set("status", values.status);
  if (values.date) params.set("date", values.date);
  if (values.time) params.set("time", values.time);
  // "upcoming" is the default without a search; "all" is the default with one
  if (values.when !== (values.q ? "all" : "upcoming")) params.set("when", values.when);
  const query = params.toString();
  return query ? `/admin/bookings?${query}` : "/admin/bookings";
}

// The filter area.
// Takes: the current filters, the class start times to offer (from the
// weekly schedule), and the number of matching bookings (with the limit).
// Gives back: the chips, the form and a count line.
export function BookingFilters({
  values,
  timeOptions,
  summary,
}: {
  values: BookingFilterValues;
  timeOptions: SelectOption[];
  summary: string; // e.g. "12 bookings"
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Status chips: one row that scrolls sideways on phones (inside its
          own box, so the page never does) */}
      <nav aria-label="Filter by status">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {STATUS_CHIPS.map((chip) => {
            const active = chip.key === values.status;
            return (
              <li key={chip.key} className="shrink-0">
                <Link
                  href={bookingsHref({ ...values, status: chip.key })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                    active
                      ? "border-brown bg-brown font-semibold text-card"
                      : "border-admin-active bg-white text-brown hover:bg-admin-bg",
                  )}
                >
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Search + date + time + when. action = this same page. */}
      <Form action="/admin/bookings" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        {/* Keep the chosen status chip when searching */}
        {values.status !== "all" && <input type="hidden" name="status" value={values.status} />}
        <Input
          label="Search"
          name="q"
          type="search"
          defaultValue={values.q}
          placeholder="Name, email, phone or B69-…"
          maxLength={100}
          className="sm:col-span-2 lg:col-span-1"
          // Leave the browser's own "remember what I typed" list off: it can
          // show other clients' names
          autoComplete="off"
        />
        <Input label="Class date" name="date" type="date" defaultValue={values.date} />
        <Select
          label="Class time"
          name="time"
          defaultValue={values.time}
          options={[{ value: "", label: "All classes" }, ...timeOptions]}
        />
        <Select
          label="Show"
          name="when"
          defaultValue={values.when}
          hint={values.date ? "Ignored when a date is picked" : undefined}
          options={[
            { value: "upcoming", label: "Today and later" },
            { value: "past", label: "Past classes" },
            { value: "all", label: "All dates" },
          ]}
        />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="flex-1 lg:flex-none">
            <Search aria-hidden="true" className="size-4" />
            Search
          </Button>
          <Link
            href="/admin/bookings"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg"
          >
            Clear
          </Link>
        </div>
      </Form>

      {/* role="status": screen readers hear the new count after a search */}
      <p role="status" className="text-xs text-muted">
        {summary}
      </p>
    </div>
  );
}
