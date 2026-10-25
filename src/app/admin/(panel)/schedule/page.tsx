// Admin Schedule: /admin/schedule
// Where it's used: the admin menu ("Schedule").
// No mockup for this page: it follows the admin card style.
//
// Three parts:
//   1. The WEEKLY PATTERN (schedule_templates): day, start and end time,
//      seats, on / off. Saved straight into the table (RLS: admins only)
//      by saveTemplate() / addTemplate() in src/lib/admin/setup-actions.ts.
//   2. "Create classes": runs generate_sessions(weeks), which makes the
//      dated classes from the pattern. Classes that already exist are NOT
//      changed, so changing the pattern only affects classes made later.
//   3. The DATED CLASSES for the next 4 weeks: change one class's seats or
//      open / close it for booking (admin_update_session, never below the
//      seats already taken), or cancel it (the existing Cancel class box).
// Saving the pattern clears the cached weekly schedule that Home and About
// Us show (updateTag("schedule")).
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { CancelClassButton } from "@/components/admin/CancelClassButton";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { addTemplate, createClasses, saveTemplate, updateClass } from "@/lib/admin/setup-actions";
import { requireAdmin } from "@/lib/auth/user";
import { adminSeatsBadge } from "@/lib/booking-rules";
import { getAdminSessions } from "@/lib/data/admin";
import { getScheduleTemplates } from "@/lib/data/admin-setup";
import { addDays, formatClassDate, formatTimeRange, manilaDateString, weekdayName } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminSession, ScheduleTemplate } from "@/types/app";

export const metadata: Metadata = { title: "Schedule · Admin" };

// How many days of dated classes to list.
const DAYS_SHOWN = 28;

// The days of the week for the drop-down, Monday first (0 = Sunday in the database).
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: String(day), label: weekdayName(day) }));

// The Schedule page.
// Takes: nothing. Gives back: the heading, then the live part in <Suspense>.
export default function AdminSchedulePage() {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Schedule"
        intro="The weekly class pattern, and the dated classes made from it."
      />
      <Suspense fallback={<AdminLoading label="the schedule" />}>
        <ScheduleBody />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the pattern, the "Create classes" card and the dated classes.
// Takes: nothing. Gives back: the cards.
async function ScheduleBody() {
  await requireAdmin();
  const today = manilaDateString(nowForThisVisit());

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

  // Group the dated classes by day: [["2026-10-23", [...]], ...]
  const byDay = new Map<string, AdminSession[]>();
  for (const session of sessions) {
    byDay.set(session.date, [...(byDay.get(session.date) ?? []), session]);
  }

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {/* ---- 1. The weekly pattern ---- */}
        <AdminCard className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Weekly pattern</h2>
            <p className="text-xs text-muted">
              Changes here only affect classes made from now on with &quot;Create classes&quot;. Classes that already
              have a date keep their time and seats (change those one by one below).
            </p>
          </div>
          {templates.length === 0 && <p className="text-sm text-muted">No class times yet. Add one below.</p>}
          <ul className="flex flex-col gap-3">
            {templates.map((template) => (
              <li key={template.id} className="rounded-2xl border border-admin-line p-3.5">
                <AdminActionForm action={saveTemplate} submitLabel="Save" buttonVariant="secondary" className="gap-3">
                  <input type="hidden" name="template_id" value={template.id} />
                  <TemplateFields template={template} idPrefix={template.id} />
                </AdminActionForm>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-admin-bg p-3.5">
            <AdminActionForm action={addTemplate} submitLabel="Add class time" resetOnSave className="gap-3">
              <AdminOverline as="h3">Add a class time</AdminOverline>
              <TemplateFields template={null} idPrefix="new" />
            </AdminActionForm>
          </div>
        </AdminCard>

        {/* ---- 2. Create classes ---- */}
        <AdminCard className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Create classes</h2>
          <p className="text-sm leading-relaxed">
            Makes the dated classes from the weekly pattern (only the slots that are on), from today up to the weeks
            you pick. Classes that already exist are skipped and <strong>not changed</strong>, so it&apos;s safe to
            press again. Clients can book this month and next month, so keep classes 9 weeks ahead.
          </p>
          <AdminActionForm action={createClasses} submitLabel="Create classes" pendingLabel="Creating…">
            <Select
              label="How far ahead"
              name="weeks"
              required
              // 9 weeks (Change 17): enough to cover all of next month
              defaultValue="9"
              options={Array.from({ length: 12 }, (_, n) => ({
                value: String(n + 1),
                label: `${n + 1} week${n === 0 ? "" : "s"}`,
              }))}
            />
          </AdminActionForm>
          <p className="text-xs text-muted">
            A nightly job will do this by itself later (Phase E). Until then, press this every week or two.
          </p>
        </AdminCard>
      </div>

      {/* ---- 3. Dated classes ---- */}
      <section aria-labelledby="dated-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="dated-heading" className="text-lg font-semibold">
            Classes in the next 4 weeks
          </h2>
          <p className="text-xs text-muted">
            Change the seats of one class (for example 3 instead of 4), or close it so nobody can book it. People who
            are already booked keep their seats. To cancel a class (clients get a free transfer), use Cancel class.
          </p>
        </div>
        {byDay.size === 0 ? (
          <AdminCard className="text-sm text-muted">
            No classes in the next 4 weeks. Press &quot;Create classes&quot; above.
          </AdminCard>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {[...byDay.entries()].map(([date, daySessions]) => (
              <AdminCard key={date} className="flex flex-col gap-3">
                <h3 className="text-[15px] font-semibold">{formatClassDate(date).full}</h3>
                <ul className="flex flex-col divide-y divide-admin-bg">
                  {daySessions.map((session) => (
                    <DatedClass key={session.session_id} session={session} />
                  ))}
                </ul>
              </AdminCard>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// The fields of one weekly slot (used by "Save" and by "Add a class time").
// Takes: the template (null = a new one) and a prefix so every field id on
// the page is different.
// Gives back: the day, times, seats and on / off fields.
function TemplateFields({ template, idPrefix }: { template: ScheduleTemplate | null; idPrefix: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] sm:items-end">
      <Select
        label="Day"
        name="weekday"
        id={`${idPrefix}-weekday`}
        required
        options={WEEKDAY_OPTIONS}
        defaultValue={template ? String(template.weekday) : "4"}
        className="col-span-2 sm:col-span-1"
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
        className="col-span-2 sm:col-span-1"
      />
      <Checkbox
        name="is_active"
        id={`${idPrefix}-active`}
        defaultChecked={template ? template.is_active : true}
        label="On (make classes from this slot)"
        className="col-span-2 sm:col-span-4"
      />
    </div>
  );
}

// One dated class: time, seats badge, and the seats / open-closed form.
// Cancelled or finished classes are shown without the form.
// Takes: the class. Gives back: an <li>.
function DatedClass({ session }: { session: AdminSession }) {
  const badge = adminSeatsBadge(session.seats_taken, session.capacity, session.status);
  const label = formatTimeRange(session.start_time, session.end_time);
  const canChange = session.status !== "cancelled" && !session.has_ended;

  return (
    <li className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {canChange ? (
        <>
          <AdminActionForm action={updateClass} submitLabel="Save" buttonVariant="secondary" className="gap-2.5">
            <input type="hidden" name="session_id" value={session.session_id} />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Seats"
                name="capacity"
                id={`${session.session_id}-capacity`}
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
                id={`${session.session_id}-status`}
                required
                defaultValue={session.status}
                options={[
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ]}
              />
            </div>
          </AdminActionForm>
          <CancelClassButton
            sessionId={session.session_id}
            classLabel={`${formatClassDate(session.date).short} · ${label}`}
            bookedCount={session.seats_taken}
            className="self-start"
          />
        </>
      ) : (
        <p className="text-xs text-muted">
          {session.status === "cancelled" ? "Cancelled by the cafe." : "This class has ended."}
        </p>
      )}
    </li>
  );
}
