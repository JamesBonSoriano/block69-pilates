// Admin Schedule: /admin/schedule
// Where it's used: the admin menu ("Schedule").
// Version 1.4 (PDF page 23, "too cluttered"): the stacked forms became two
// clear tables, and each change opens a small pop-up box (AdminDialogButton).
// On phones each row is a small stacked card instead, so nothing makes the
// page wider than the screen; tablets and laptops get the tables.
//
// Three parts:
//   1. The WEEKLY PATTERN (schedule_templates): Day, Starts, Ends, Seats,
//      On/Off and Edit. "Add class time" adds a row. Saved straight into the
//      table (RLS: admins only) by saveTemplate() / addTemplate() in
//      src/lib/admin/setup-actions.ts.
//   2. "Open classes for booking": one button, openNextWeeks(), always makes
//      the dated classes 9 weeks ahead (this month and next month) from the
//      pattern and says how many new ones were made. Classes that already
//      exist are NOT changed.
//   3. The UPCOMING DATED CLASSES, 10 per page (?page=2): date, time, seats
//      taken / capacity and status. Edit changes one class's seats or opens /
//      closes it (admin_update_session, never below the seats already
//      taken); Cancel class cancels it (clients get a free transfer).
// Saving the pattern clears the cached weekly schedule that Home and About
// Us show (updateTag("schedule")).
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDialogButton } from "@/components/admin/AdminDialogButton";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { CancelClassButton } from "@/components/admin/CancelClassButton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { addTemplate, openNextWeeks, saveTemplate, updateClass } from "@/lib/admin/setup-actions";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { getAdminSessions } from "@/lib/data/admin";
import { getScheduleTemplates } from "@/lib/data/admin-setup";
import { addDays, formatClassDate, formatTime, formatTimeRange, manilaDateString, weekdayName } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminSession, ScheduleTemplate } from "@/types/app";

export const metadata: Metadata = { title: "Schedule · Admin" };

// How far ahead the dated classes list looks (admin_list_sessions gives
// back at most 92 days; classes are made 9 weeks ahead).
const DAYS_SHOWN = 92;

// Dated classes per page.
const PER_PAGE = 10;

// The days of the week for the drop-down, Monday first (0 = Sunday in the database).
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: String(day), label: weekdayName(day) }));

// The look of every table header cell.
const TH = "px-3 py-3 font-semibold lg:px-4";
// The look of every table cell.
const TD = "px-3 py-2.5 lg:px-4";
// The look of a table's header row.
const HEAD_ROW = "border-b border-admin-line bg-admin-bg/50 text-left text-[11px] uppercase tracking-[0.06em] text-muted";
// The smaller buttons inside the rows (still 44px tall).
const ROW_BUTTON = "px-4 py-2 text-[13px]";

// The Schedule page.
// Takes: searchParams (page = which page of dated classes).
// Gives back: the heading, then the live part in <Suspense>.
export default function AdminSchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Schedule"
        intro="The weekly class pattern, and the dated classes made from it."
      />
      <Suspense fallback={<AdminLoading label="the schedule" />}>
        <ScheduleBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the pattern, the "Open classes for booking" card and the dated classes.
// Takes: the searchParams promise. Gives back: the cards.
async function ScheduleBody({ searchParams }: { searchParams: PageProps<"/admin/schedule">["searchParams"] }) {
  await requireAdmin();
  const today = manilaDateString(nowForThisVisit());
  const pageParam = Number(firstParam((await searchParams).page));

  let templates: ScheduleTemplate[];
  let sessions: AdminSession[];
  try {
    [templates, sessions] = await Promise.all([
      getScheduleTemplates(),
      getAdminSessions(today, addDays(today, DAYS_SHOWN - 1)),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the schedule" />;
  }

  // Only classes that haven't ended yet, then cut out the page asked for
  const upcoming = sessions.filter((session) => !session.has_ended);
  const pages = Math.max(1, Math.ceil(upcoming.length / PER_PAGE));
  const page = Number.isInteger(pageParam) ? Math.min(Math.max(pageParam, 1), pages) : 1;
  const shown = upcoming.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      {/* grid-cols-1 on phones: the one column may shrink, so the page never gets wider than the screen */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {/* ---- 1. The weekly pattern ---- */}
        <AdminCard className="flex flex-col p-0 lg:p-0">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between lg:p-6">
            <div>
              <h2 className="text-base font-semibold">Weekly pattern</h2>
              <p className="text-xs text-muted">
                Changes here only affect classes made from now on. Classes that already have a date keep their time
                and seats (change those under Upcoming classes).
              </p>
            </div>
            <AdminDialogButton label="Add class time" title="Add a class time" variant="primary" className="shrink-0">
              <AdminActionForm action={addTemplate} submitLabel="Add class time" resetOnSave className="gap-3">
                <TemplateFields template={null} idPrefix="new" />
              </AdminActionForm>
            </AdminDialogButton>
          </div>

          {templates.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted lg:px-6 lg:pb-6">No class times yet. Press &quot;Add class time&quot;.</p>
          ) : (
            <>
              {/* ===== Tablet and laptop: table ===== */}
              <div className="hidden border-t border-admin-line md:block">
                <table className="w-full border-collapse text-[13px]">
                  <caption className="sr-only">Weekly class pattern</caption>
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th scope="col" className={TH}>Day</th>
                      <th scope="col" className={TH}>Starts</th>
                      <th scope="col" className={TH}>Ends</th>
                      <th scope="col" className={TH}>Seats</th>
                      <th scope="col" className={TH}>On / Off</th>
                      <th scope="col" className={`${TH} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template) => (
                      <tr key={template.id} className="border-b border-admin-bg last:border-b-0">
                        <td className={`${TD} font-semibold`}>{weekdayName(template.weekday)}</td>
                        <td className={TD}>{formatTime(template.start_time)}</td>
                        <td className={TD}>{formatTime(template.end_time)}</td>
                        <td className={TD}>{template.default_capacity}</td>
                        <td className={TD}>
                          <OnOffBadge on={template.is_active} />
                        </td>
                        <td className={`${TD} text-right`}>
                          <TemplateEditButton template={template} idPrefix={template.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ===== Phone: one small card per class time ===== */}
              <ul className="flex flex-col divide-y divide-admin-bg border-t border-admin-line md:hidden">
                {templates.map((template) => (
                  <li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm font-semibold">{weekdayName(template.weekday)}</p>
                      <p className="text-xs text-muted">
                        {formatTimeRange(template.start_time, template.end_time)} · {template.default_capacity} seats
                      </p>
                      <OnOffBadge on={template.is_active} className="self-start" />
                    </div>
                    {/* A different id prefix, so no two fields on the page share an id */}
                    <TemplateEditButton template={template} idPrefix={`${template.id}-phone`} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </AdminCard>

        {/* ---- 2. Open classes for booking ---- */}
        <AdminCard className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Open classes for booking</h2>
          <p className="text-sm leading-relaxed">
            Makes the dated classes clients can book from the weekly pattern, for this month and next month. Existing
            classes are not changed.
          </p>
          <AdminActionForm action={openNextWeeks} submitLabel="Open the next 9 weeks" pendingLabel="Opening…">
            {null}
          </AdminActionForm>
        </AdminCard>
      </div>

      {/* ---- 3. Upcoming dated classes ---- */}
      <AdminCard className="flex flex-col p-0 lg:p-0">
        <div className="p-4 lg:p-6">
          <h2 id="dated-heading" className="text-base font-semibold">
            Upcoming classes
          </h2>
          <p className="text-xs text-muted">
            Edit one class&apos;s seats (for example 3 instead of 4), or close it so nobody can book it. People who
            are already booked keep their seats. Cancel class gives booked clients a free transfer.
          </p>
        </div>

        {upcoming.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted lg:px-6 lg:pb-6">
            No upcoming classes. Press &quot;Open the next 9 weeks&quot; above.
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
                total={upcoming.length}
                noun="classes"
                label="Upcoming classes pages"
                hrefFor={(n) => (n === 1 ? "/admin/schedule" : `/admin/schedule?page=${n}`)}
              />
            </div>
          </>
        )}
      </AdminCard>
    </>
  );
}

// The On / Off badge of a weekly class time.
// Takes: whether it's on, and extra classes. Gives back: the badge.
function OnOffBadge({ on, className }: { on: boolean; className?: string }) {
  return (
    <Badge variant={on ? "success" : "neutral"} className={className}>
      {on ? "On" : "Off"}
    </Badge>
  );
}

// The Edit button of one weekly class time, with its pop-up form.
// Takes: the template and an id prefix (the table and the phone card each
// get their own, so field ids never repeat on the page).
// Gives back: the button and its box.
function TemplateEditButton({ template, idPrefix }: { template: ScheduleTemplate; idPrefix: string }) {
  const slot = `${weekdayName(template.weekday)} ${formatTime(template.start_time)}`;
  return (
    <AdminDialogButton
      label="Edit"
      srLabel={` ${slot}`}
      title="Edit class time"
      intro={`${slot}. Classes that already have a date don't change.`}
      className={ROW_BUTTON}
    >
      <AdminActionForm action={saveTemplate} submitLabel="Save" className="gap-3">
        <input type="hidden" name="template_id" value={template.id} />
        <TemplateFields template={template} idPrefix={idPrefix} />
      </AdminActionForm>
    </AdminDialogButton>
  );
}

// The fields of one weekly slot (used by Edit and by "Add class time").
// Takes: the template (null = a new one) and a prefix so every field id on
// the page is different.
// Gives back: the day, times, seats and on / off fields.
function TemplateFields({ template, idPrefix }: { template: ScheduleTemplate | null; idPrefix: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Select
        label="Day"
        name="weekday"
        id={`${idPrefix}-weekday`}
        required
        options={WEEKDAY_OPTIONS}
        defaultValue={template ? String(template.weekday) : "4"}
        className="col-span-2"
      />
      <Input
        label="Starts"
        name="start_time"
        id={`${idPrefix}-start`}
        type="time"
        required
        defaultValue={template?.start_time.slice(0, 5)}
      />
      <Input
        label="Ends"
        name="end_time"
        id={`${idPrefix}-end`}
        type="time"
        required
        defaultValue={template?.end_time.slice(0, 5)}
      />
      <Input
        label="Seats"
        name="capacity"
        id={`${idPrefix}-capacity`}
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        step={1}
        required
        defaultValue={template ? String(template.default_capacity) : "4"}
        className="col-span-2"
      />
      <Checkbox
        name="is_active"
        id={`${idPrefix}-active`}
        defaultChecked={template ? template.is_active : true}
        label="On (make classes from this slot)"
        className="col-span-2"
      />
    </div>
  );
}

// The status badge of one dated class.
// Takes: the class. Gives back: Cancelled, Closed, Full, In progress or Open.
function ClassStatusBadge({ session }: { session: AdminSession }) {
  const status = classStatus(session);
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

// The status word for one dated class.
// Takes: the class. Gives back: the badge text and color.
function classStatus(session: AdminSession): { label: string; variant: BadgeVariant } {
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
  session: AdminSession;
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
