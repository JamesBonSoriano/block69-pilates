// The Attendance list: /admin/attendance
//   ?session=<class id>  open that class
//   ?date=YYYY-MM-DD     open the first class on that day
//   (nothing)            open today's next class (see pickDefaultSession)
// Where it's used: the admin menu and tab bar, the Dashboard ("Attendance"
// on each class, "Mark attendance" in Needs action), Bookings and Walk-in.
// Layout follows docs/designs/AdminAttendance.html (laptop) and
// PhoneAdminAttendance.html (phone).
//
// For the barista and the instructor at the counter (mostly on a phone):
//   - class chips to switch class, and a date box for other days
//   - what to prepare: guests, drinks by type, mats to set out
//   - each guest with drink, mat, first time / health notes, payment, and big
//     Attended / No-show buttons (admin_set_attendance, migration 3)
//   - "Print list": prints just the list, with tick boxes instead of buttons
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks (migration 9).

import { CalendarSearch } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/account/PrintButton";
import { AttendanceButtons } from "@/components/admin/AttendanceButtons";
import {
  AdminCard,
  AdminLoadError,
  AdminLoading,
  AdminOverline,
  AdminPage,
  AdminPageHeader,
  StatCard,
} from "@/components/admin/AdminUi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isComing, pickDefaultSession, prepSummary } from "@/lib/admin/display";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { adminBookingStatusBadge, adminSeatsBadge, paymentMethodName } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { getAdminSessions, getClassRosters, getSessionDate } from "@/lib/data/admin";
import {
  addDays,
  formatClassDate,
  formatManilaDateTime,
  formatPeso,
  formatTime,
  formatTimeRange,
  manilaDateString,
} from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminRosterItem, AdminSession } from "@/types/app";

export const metadata: Metadata = { title: "Attendance · Admin" };

// The Attendance page.
// Takes: searchParams (?session= or ?date=).
// Gives back: the heading, then the live list inside <Suspense>.
export default function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Bookings"
        title="Attendance list"
        intro="One list per class. The barista uses it to prepare drinks and mats before class."
        actions={<PrintButton label="Print list" />}
      />
      <Suspense fallback={<AdminLoading label="the attendance list" />}>
        <AttendanceList searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: chips, summary and the guest list.
// Takes: the searchParams promise.
// Gives back: everything under the heading.
async function AttendanceList({ searchParams }: { searchParams: PageProps<"/admin/attendance">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const wantedSession = firstParam(params.session);
  const wantedDate = firstParam(params.date);
  const nowMs = nowForThisVisit();
  const today = manilaDateString(nowMs);

  let sessions: AdminSession[];
  let selected: AdminSession | undefined;
  let roster: AdminRosterItem[] = [];
  let anchor: string;
  try {
    // The day to show classes around: the picked class's day, the picked
    // date, or today
    anchor =
      (wantedSession ? await getSessionDate(wantedSession) : null) ??
      (wantedDate && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate) ? wantedDate : today);
    // 3 days back (late marking) to a week ahead
    sessions = await getAdminSessions(addDays(anchor, -3), addDays(anchor, 7));
    selected = sessions.find((session) => session.session_id === wantedSession) ?? pickDefaultSession(sessions, anchor);
    if (selected) roster = await getClassRosters([selected.session_id]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the attendance list" />;
  }

  return (
    <>
      <ClassPicker sessions={sessions} selectedId={selected?.session_id} today={today} anchor={anchor} />
      {selected ? (
        <ClassAttendance session={selected} roster={roster} today={today} nowMs={nowMs} />
      ) : (
        <AdminCard className="text-sm text-muted">No classes around this date. Try another day above.</AdminCard>
      )}
    </>
  );
}

// The class chips (swipe sideways on phones) and the "other day" box.
// Takes: the classes to offer, the chosen one, today and the day shown.
// Gives back: the chips and a small GET form. Hidden when printing.
function ClassPicker({
  sessions,
  selectedId,
  today,
  anchor,
}: {
  sessions: AdminSession[];
  selectedId: string | undefined;
  today: string;
  anchor: string;
}) {
  return (
    <div className="flex flex-col gap-3 print:hidden">
      <nav aria-label="Pick a class">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {sessions.map((session) => {
            const active = session.session_id === selectedId;
            const day = session.date === today ? "Today" : formatClassDate(session.date).short;
            return (
              <li key={session.session_id} className="shrink-0">
                <Link
                  href={`/admin/attendance?session=${session.session_id}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                    active
                      ? "border-brown bg-brown font-semibold text-card"
                      : "border-admin-active bg-white text-brown hover:bg-admin-bg",
                    session.status === "cancelled" && !active && "text-muted line-through",
                  )}
                >
                  {day} · {formatTime(session.start_time)}
                  {session.to_mark > 0 && (
                    // A small red dot: this class still has guests to mark
                    <>
                      <span aria-hidden="true" className="size-2 rounded-full bg-error" />
                      <span className="sr-only">(not marked yet)</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Form action="/admin/attendance" className="flex items-end gap-2">
        <Input label="Another day" name="date" type="date" defaultValue={anchor} className="max-w-48 flex-1" />
        <Button type="submit" variant="secondary">
          <CalendarSearch aria-hidden="true" className="size-4" />
          Show
        </Button>
      </Form>
    </div>
  );
}

// One class: the summary cards and the list of guests.
// Takes: the class, its roster, today's date and "now" (milliseconds).
// Gives back: the cards and lists.
function ClassAttendance({
  session,
  roster,
  today,
  nowMs,
}: {
  session: AdminSession;
  roster: AdminRosterItem[];
  today: string;
  nowMs: number;
}) {
  const coming = roster.filter(isComing);
  const unsettled = roster.filter((guest) => !isComing(guest));
  const prep = prepSummary(roster);
  const seats = adminSeatsBadge(session.seats_taken, session.capacity, session.status);
  const marked = coming.filter((guest) => guest.status !== "confirmed").length;
  // Pesos of mat rental for this class (all of it goes to the strays)
  const matPesos = coming.reduce((sum, guest) => sum + (guest.mat_rental ? Number(guest.mat_fee) : 0), 0);
  // admin_set_attendance() allows marking from the class day
  const canMark = session.date <= today;
  const closesAt = new Date(session.booking_closes_at);

  return (
    <>
      {/* ---- What to prepare ---- */}
      <section aria-label="What to prepare" className="grid grid-cols-3 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Guests"
          value={`${prep.guests}/${session.capacity}`}
          note={session.seats_left === 0 ? "Class full" : `${session.seats_left} seat${session.seats_left === 1 ? "" : "s"} free`}
        />
        <StatCard
          label="Drinks"
          value={String(prep.guests)}
          note={
            prep.guests === 0
              ? "None yet"
              : [
                  ...prep.drinks.map((drink) => `${drink.count} ${drink.name}`),
                  ...(prep.undecidedDrinks > 0 ? [`${prep.undecidedDrinks} decide at cafe`] : []),
                ].join(" · ")
          }
        />
        <StatCard
          label="Mats"
          value={String(prep.mats)}
          note={prep.mats > 0 ? `${formatPeso(matPesos)} to the strays` : "Everyone brings their own"}
        />
        <div className="hidden lg:block">
          <StatCard label="Marked" value={`${marked} of ${coming.length}`} note="attended or no-show" />
        </div>
      </section>

      {/* ---- The guest list ---- */}
      <AdminCard className="flex flex-col gap-4 p-0 lg:p-0">
        <div className="flex flex-col gap-2 border-b border-admin-line p-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <h2 className="text-base font-semibold lg:text-lg">
              {formatClassDate(session.date).full} · {formatTimeRange(session.start_time, session.end_time)}
            </h2>
            <p className="text-xs text-muted">
              {session.status === "cancelled"
                ? "The cafe cancelled this class. Booked clients can transfer for free."
                : nowMs >= closesAt.getTime()
                  ? `Online booking closed ${formatManilaDateTime(closesAt)}`
                  : `Online booking closes ${formatManilaDateTime(closesAt)}`}
            </p>
          </div>
          <Badge variant={seats.variant} className="self-start sm:self-auto">
            {seats.label}
          </Badge>
        </div>

        {coming.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted lg:px-6">Nobody is booked in this class yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-admin-line">
            {coming.map((guest, n) => (
              <GuestRow key={guest.booking_id} guest={guest} number={n + 1} canMark={canMark} />
            ))}
          </ol>
        )}

        <p className="border-t border-admin-line px-4 py-3 text-xs text-muted lg:px-6">
          {canMark
            ? "Marking No-show forfeits the seat with no refund or voucher, as the policy says. A mistake can be changed."
            : "Attendance can be marked from the class day."}
        </p>
      </AdminCard>

      {/* ---- Bookings not settled yet ---- */}
      {unsettled.length > 0 && (
        <AdminCard className="flex flex-col gap-3">
          <AdminOverline as="h2">Not confirmed yet</AdminOverline>
          <ul className="flex flex-col gap-2">
            {unsettled.map((guest) => {
              const badge = adminBookingStatusBadge(guest.status);
              return (
                <li key={guest.booking_id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/admin/bookings/${guest.booking_id}`} className="min-w-0 truncate hover:underline">
                    {guest.guest_name}
                  </Link>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            These don&apos;t get a drink or mat until they&apos;re confirmed. Unpaid holds free their seat by themselves.
          </p>
        </AdminCard>
      )}
    </>
  );
}

// One guest on the attendance list.
// Takes: the roster row, their number on the list, and whether attendance
// can be marked yet.
// Gives back: an <li> with the details and the buttons (or tick boxes when
// printed).
function GuestRow({ guest, number, canMark }: { guest: AdminRosterItem; number: number; canMark: boolean }) {
  const source = guest.is_walkin ? "Walk-in" : guest.moved_here ? "Moved here" : "Online";
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:gap-6 lg:px-6 print:flex-row print:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-admin-bg text-xs font-semibold text-brown"
        >
          {number}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[15px] font-semibold">
            <Link href={`/admin/bookings/${guest.booking_id}`} className="hover:underline">
              {guest.guest_name}
            </Link>
            <span className="ml-2 align-middle text-[11px] font-normal text-muted">{source}</span>
          </p>
          {/* What the barista needs, in bold */}
          <p className="text-sm font-semibold text-brown">
            {guest.drink_choice ?? "Drink: decide at the cafe"} · {guest.mat_rental ? "Mat" : "Own mat"}
          </p>
          {(guest.first_time || guest.health_notes) && (
            <p className="text-xs text-warning">
              {guest.first_time && "First time"}
              {guest.first_time && guest.health_notes && " · "}
              {guest.health_notes && `Note: ${guest.health_notes}`}
            </p>
          )}
          <p className="text-xs text-muted">
            {guest.guest_contact && (
              <a href={`tel:${guest.guest_contact.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2">
                {guest.guest_contact}
              </a>
            )}
            {guest.guest_contact && " · "}
            {guest.paid_amount !== null && guest.paid_provider
              ? `Paid ${formatPeso(Number(guest.paid_amount))} · ${paymentMethodName(guest.paid_method, guest.paid_provider)}`
              : "No payment found"}
          </p>
        </div>
      </div>

      <div className="print:hidden">
        {canMark ? (
          <AttendanceButtons bookingId={guest.booking_id} status={guest.status} guestName={guest.guest_name} />
        ) : (
          <Badge variant="success">Confirmed</Badge>
        )}
      </div>
      {/* On paper: tick boxes instead of buttons (or the saved result) */}
      <p className="hidden shrink-0 gap-4 text-xs print:flex">
        {guest.status === "confirmed" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-4 border border-ink" /> Here
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-4 border border-ink" /> No-show
            </span>
          </>
        ) : (
          <b>{guest.status === "attended" ? "Attended" : "No-show"}</b>
        )}
      </p>
    </li>
  );
}
