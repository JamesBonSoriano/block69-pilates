// Admin Schedule lists dated classes and provides add, edit, and cancel controls.
// Where it's used: the admin menu and tab bar ("Schedule").
// Version 1.9: a "Sort by date" box (soonest / latest first, ?sort=desc) sits
// right under the page title, where the short intro line used to leave an
// empty strip. The database sorts before splitting into pages
// (admin_upcoming_classes p_sort), and the page links keep the sort.

import { ArrowDownUp } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDialogButton } from "@/components/admin/AdminDialogButton";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { CancelClassButton } from "@/components/admin/CancelClassButton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { addDatedClass, updateClass } from "@/lib/admin/setup-actions";
import { SCHEDULE_SORT_OPTIONS, cleanScheduleSort, scheduleHref, type ScheduleSort } from "@/lib/admin/sort";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { getUpcomingAdminClasses } from "@/lib/data/admin";
import { formatClassDate, formatTimeRange, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { UpcomingAdminClass } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Schedule · Admin" };

// Dated classes per page, matching the database page size.
const PER_PAGE = 5;

// The look of every table header cell.
const TH = "px-3 py-3 font-semibold lg:px-4";
// The look of every table cell.
const TD = "px-3 py-2.5 lg:px-4";
// The look of a table's header row.
const HEAD_ROW = "border-b border-admin-line bg-admin-bg/50 text-left text-[11px] uppercase tracking-[0.06em] text-muted";
// The smaller buttons inside the rows (still 44px tall).
const ROW_BUTTON = "px-4 py-2 text-[13px]";

// The Schedule page.
// Takes: searchParams (page = which page of dated classes, sort = asc / desc).
// Gives back: the heading, then the live part in <Suspense>.
// Version 1.9: no intro line under the title (it left an empty-looking
// strip); the Sort box sits there instead (inside ScheduleBody).
export default function AdminSchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  return (
    <AdminPage>
      <AdminPageHeader overline="Mat Pilates admin" title="Schedule" />
      <Suspense fallback={<AdminLoading label="the schedule" />}>
        <ScheduleBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// Loads the requested page of dated classes and the Add class form.
// Takes: the searchParams promise. Gives back: the cards.
async function ScheduleBody({ searchParams }: { searchParams: PageProps<"/admin/schedule">["searchParams"] }) {
  await requireAdmin();
  const today = manilaDateString(nowForThisVisit());
  const params = await searchParams;
  const pageParam = Number(firstParam(params.page));
  // Version 1.9: "desc" (latest first) or the default "asc" (soonest first)
  const sort = cleanScheduleSort(firstParam(params.sort));

  let shown: UpcomingAdminClass[];
  try {
    shown = await getUpcomingAdminClasses(Number.isSafeInteger(pageParam) && pageParam <= 2147483647 ? pageParam : 1, sort);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the schedule" />;
  }

  // The server clamps out-of-range pages after sessions end.
  const total = shown[0]?.total_count ?? 0;
  const page = shown[0]?.page_number ?? 1;

  return (
    <>
      {/* Version 1.9: sort the dated classes by date (a GET form, so it works
          without JavaScript and goes back to page 1) */}
      <ScheduleSortForm sort={sort} />

      {/* Upcoming sessions are managed individually. */}
      <AdminCard className="flex flex-col p-0 lg:p-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between lg:p-6">
          <div>
            <h2 id="dated-heading" className="text-base font-semibold">
              Upcoming classes
            </h2>
            <p className="text-xs text-muted">
              Edit one class&apos;s seats (for example 3 instead of 4), or close it so nobody can book it. People who
              are already booked keep their seats. Cancel class gives booked clients a free re-schedule.
            </p>
          </div>
          <AdminDialogButton label="Add class" title="Add class" variant="primary" intro="Dates and times are in Philippine time.">
            <AdminActionForm action={addDatedClass} submitLabel="Add class" resetOnSave className="gap-3">
              <Input label="Class date" name="date" type="date" min={today} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Starts" name="start_time" type="time" required />
                <Input label="Ends" name="end_time" type="time" required />
              </div>
              <Input label="Seats" name="capacity" type="number" min={1} max={50} defaultValue="4" required />
            </AdminActionForm>
          </AdminDialogButton>
        </div>

        {total === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted lg:px-6 lg:pb-6">
            No upcoming classes. Select Add class to schedule one.
          </p>
        ) : (
          <>
            {/* ===== Tablet and laptop: table ===== */}
            <div className="hidden border-t border-admin-line md:block">
              <table aria-labelledby="dated-heading" className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th scope="col" className={TH}>Date</th>
                    <th scope="col" className={TH}>Time</th>
                    <th scope="col" className={TH}>Seats taken</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((session) => (
                    <tr key={session.session_id} className="border-b border-admin-bg last:border-b-0">
                      <td className={`${TD} font-semibold`}>{formatClassDate(session.date).short}</td>
                      <td className={`${TD} whitespace-nowrap`}>{formatTimeRange(session.start_time, session.end_time)}</td>
                      <td className={TD}>
                        {session.seats_taken} / {session.capacity}
                      </td>
                      <td className={TD}>
                        <ClassStatusBadge session={session} />
                      </td>
                      <td className={TD}>
                        <DatedClassActions session={session} idPrefix={session.session_id} className="justify-end" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ===== Phone: one small card per class ===== */}
            <ul className="flex flex-col divide-y divide-admin-bg border-t border-admin-line md:hidden">
              {shown.map((session) => (
                <li key={session.session_id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{formatClassDate(session.date).short}</p>
                      <p className="text-xs text-muted">{formatTimeRange(session.start_time, session.end_time)}</p>
                    </div>
                    <ClassStatusBadge session={session} />
                  </div>
                  <p className="text-xs text-muted">
                    Seats taken:{" "}
                    <span className="font-semibold text-ink">
                      {session.seats_taken} / {session.capacity}
                    </span>
                  </p>
                  <DatedClassActions session={session} idPrefix={`${session.session_id}-phone`} />
                </li>
              ))}
            </ul>

            <div className="border-t border-admin-line">
              <AdminPagination
                page={page}
                perPage={PER_PAGE}
                total={total}
                noun="classes"
                label="Upcoming classes pages"
                // Version 1.9: every page link keeps the chosen sort
                hrefFor={(n) => scheduleHref(n, sort)}
              />
            </div>
          </>
        )}
      </AdminCard>
    </>
  );
}

// The "Sort by date" box under the page title (Version 1.9).
// Takes: the sort in use now.
// Gives back: a small GET form: the date order box and an Apply button.
function ScheduleSortForm({ sort }: { sort: ScheduleSort }) {
  return (
    <Form action="/admin/schedule" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Select
        label="Sort by date"
        name="sort"
        defaultValue={sort}
        options={[...SCHEDULE_SORT_OPTIONS]}
        className="sm:w-60"
      />
      <Button type="submit" variant="secondary">
        <ArrowDownUp aria-hidden="true" className="size-4" />
        Apply
      </Button>
    </Form>
  );
}

// The status badge of one dated class.
// Takes: the class. Gives back: Cancelled, Closed, Full, In progress or Open.
function ClassStatusBadge({ session }: { session: UpcomingAdminClass }) {
  const status = classStatus(session);
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

// The status word for one dated class.
// Takes: the class. Gives back: the badge text and color.
function classStatus(session: UpcomingAdminClass): { label: string; variant: BadgeVariant } {
  if (session.status === "cancelled") return { label: "Cancelled", variant: "error" };
  if (session.status === "closed") return { label: "Closed", variant: "neutral" };
  if (session.seats_left === 0) return { label: "Full", variant: "error" };
  if (session.has_started) return { label: "In progress", variant: "info" };
  return { label: "Open", variant: "success" };
}

// The Edit and Cancel class buttons of one dated class (or a note when the
// cafe already cancelled it).
// Takes: the class, an id prefix (table and phone card each get their own)
// and extra classes for the row of buttons.
// Gives back: the buttons.
function DatedClassActions({
  session,
  idPrefix,
  className,
}: {
  session: UpcomingAdminClass;
  idPrefix: string;
  className?: string;
}) {
  if (session.status === "cancelled") {
    return <p className={cn("flex text-xs text-muted", className)}>Cancelled by the cafe</p>;
  }
  const classLabel = `${formatClassDate(session.date).short} · ${formatTimeRange(session.start_time, session.end_time)}`;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <AdminDialogButton
        label="Edit"
        srLabel={` ${classLabel}`}
        title="Edit class"
        intro={`${classLabel} · ${session.seats_taken} seat${session.seats_taken === 1 ? "" : "s"} taken`}
        className={ROW_BUTTON}
      >
        <AdminActionForm action={updateClass} submitLabel="Save" className="gap-3">
          <input type="hidden" name="session_id" value={session.session_id} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Seats"
              name="capacity"
              id={`${idPrefix}-capacity`}
              type="number"
              inputMode="numeric"
              // Never fewer than the seats already taken (the database checks too)
              min={Math.max(1, session.seats_taken)}
              max={50}
              step={1}
              required
              defaultValue={String(session.capacity)}
              hint={session.seats_taken > 0 ? `${session.seats_taken} taken` : undefined}
            />
            <Select
              label="Booking"
              name="status"
              id={`${idPrefix}-status`}
              required
              defaultValue={session.status}
              options={[
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </div>
        </AdminActionForm>
      </AdminDialogButton>
      <CancelClassButton
        sessionId={session.session_id}
        classLabel={classLabel}
        bookedCount={session.seats_taken}
        className={ROW_BUTTON}
      />
    </div>
  );
}
