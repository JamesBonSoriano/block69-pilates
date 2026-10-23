// The admin Dashboard: /admin
// Where it's used: admins land here after logging in; "Admin" in the client
// header and "Home" / "Dashboard" in the admin menu open it.
// Layout follows docs/designs/PhoneAdminDashboard.html (phone) in the admin
// frame (src/app/admin/layout.tsx).
//
// What it shows (all LIVE, loaded on every visit, never cached):
//   - number cards: today's seats taken / capacity, needs action, money paid
//     this week (and month), mat rental for the strays this month
//   - today's classes and the next classes, each with who is booked, what to
//     prepare, and Attendance / Walk-in / Cancel class buttons
//   - "Needs action": payments to check, late payments, and classes whose
//     attendance hasn't been marked
//   - quick links
//
// Protection: src/proxy.ts turns away guests and clients first, and
// requireAdmin() checks AGAIN on the server (the database's is_admin()).
// The database functions (migration 9) also refuse anyone who isn't an admin.

import { ClipboardList, ExternalLink, ListChecks, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader, StatCard } from "@/components/admin/AdminUi";
import { ClassCard } from "@/components/admin/ClassCard";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/user";
import { adminBookingStatusBadge } from "@/lib/booking-rules";
import {
  getAdminSessions,
  getClassRosters,
  getDashboardSummary,
  searchAdminBookings,
} from "@/lib/data/admin";
import { addDays, formatClassDate, formatPeso, formatTime, formatTimeRange } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBookingListItem, AdminDashboardSummary, AdminRosterItem, AdminSession } from "@/types/app";

export const metadata: Metadata = { title: "Admin Dashboard" };

// How many classes after today to show under "Next classes".
const NEXT_CLASSES = 4;

// The Dashboard page.
// Takes: nothing.
// Gives back: the admin page with the live part inside <Suspense> (it reads
// the login cookies and live data).
export default function AdminDashboardPage() {
  return (
    <AdminPage>
      <Suspense fallback={<AdminLoading label="the dashboard" blocks={4} />}>
        <Dashboard />
      </Suspense>
    </AdminPage>
  );
}

// The live part of the Dashboard.
// Takes: nothing.
// Gives back: the greeting, number cards, classes, needs action and links.
async function Dashboard() {
  const admin = await requireAdmin();

  let summary: AdminDashboardSummary;
  let sessions: AdminSession[];
  let needsAction: AdminBookingListItem[];
  let rosters: AdminRosterItem[];
  try {
    summary = await getDashboardSummary();
    const today = summary.today;
    // A week back (attendance still to mark) to two weeks ahead (next classes),
    // plus the bookings that need the admin, at the same time
    [sessions, { rows: needsAction }] = await Promise.all([
      getAdminSessions(addDays(today, -7), addDays(today, 14)),
      searchAdminBookings({ statuses: ["awaiting_verification", "paid_needs_action"], when: "all", limit: 20 }),
    ]);
    rosters = await getClassRosters(shownSessions(sessions, today).map((session) => session.session_id));
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals (e.g. redirects)
    console.error(error);
    return <AdminLoadError what="the dashboard" />;
  }

  const today = summary.today;
  const todays = sessions.filter((session) => session.date === today);
  const next = shownSessions(sessions, today).filter((session) => session.date > today);
  const toMark = sessions.filter((session) => session.to_mark > 0);
  const needsCount = summary.awaiting_verification + summary.paid_needs_action;
  const firstName = admin.fullName.split(" ")[0] || "there";

  return (
    <>
      <AdminPageHeader
        overline={formatClassDate(today).full}
        title={`${greeting(nowForThisVisit())}, ${firstName}`}
        actions={
          <>
            <ButtonLink href="/admin/walk-in">
              <UserPlus aria-hidden="true" className="size-4" />
              Walk-in booking
            </ButtonLink>
            <ButtonLink href="/admin/attendance" variant="secondary">
              <ListChecks aria-hidden="true" className="size-4" />
              Attendance list
            </ButtonLink>
          </>
        }
      />

      {/* ---- Number cards: 2 per row on phones, 4 on laptops ---- */}
      <section aria-label="Today's numbers" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Today"
          value={summary.today_classes > 0 ? `${summary.today_taken} of ${summary.today_capacity}` : "No classes"}
          note={
            summary.today_classes > 0
              ? `seats booked · ${summary.today_classes} class${summary.today_classes === 1 ? "" : "es"}`
              : "Classes run on the days in the schedule"
          }
        />
        <StatCard
          label="Needs action"
          value={String(needsCount + summary.to_mark_classes)}
          note={needsCount + summary.to_mark_classes === 0 ? "All clear" : "to review (see below)"}
          tone={needsCount + summary.to_mark_classes > 0 ? "alert" : "normal"}
        />
        <StatCard
          label="This week"
          value={formatPeso(Number(summary.paid_this_week))}
          note={`paid · ${formatPeso(Number(summary.paid_this_month))} this month`}
        />
        <StatCard
          label="For the strays"
          value={formatPeso(Number(summary.mats_this_month))}
          note="mat rentals this month"
        />
      </section>

      {/* ---- Today's classes and the next ones ---- */}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section aria-labelledby="today-heading" className="flex flex-col gap-3">
          <h2 id="today-heading" className="text-[15px] font-semibold lg:text-lg">
            Today&apos;s classes
          </h2>
          {todays.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {todays.map((session) => (
                <ClassCard key={session.session_id} session={session} roster={rosterOf(rosters, session.session_id)} />
              ))}
            </ul>
          ) : (
            <AdminCard className="text-sm text-muted">No classes today.</AdminCard>
          )}
        </section>

        <section aria-labelledby="next-heading" className="flex flex-col gap-3">
          <h2 id="next-heading" className="text-[15px] font-semibold lg:text-lg">
            Next classes
          </h2>
          {next.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {next.map((session) => (
                <ClassCard
                  key={session.session_id}
                  session={session}
                  roster={rosterOf(rosters, session.session_id)}
                  showDate
                />
              ))}
            </ul>
          ) : (
            <AdminCard className="text-sm text-muted">
              No classes in the next two weeks. New dated classes are made from the weekly schedule.
            </AdminCard>
          )}
        </section>
      </div>

      {/* ---- Needs action ---- */}
      <section aria-labelledby="needs-heading">
        <AdminCard className={needsCount + toMark.length > 0 ? "flex flex-col gap-3 border-error/40" : "flex flex-col gap-3"}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="needs-heading" className="text-[15px] font-semibold lg:text-base">
              Needs action ({needsCount + toMark.length})
            </h2>
            <span className="text-xs text-muted">Handled items leave this list</span>
          </div>

          {needsCount + toMark.length === 0 && (
            <p className="text-sm text-muted">Nothing needs you right now.</p>
          )}

          <ul className="flex flex-col gap-2">
            {needsAction.map((booking) => {
              const badge = adminBookingStatusBadge(booking.status);
              return (
                <li key={booking.booking_id}>
                  <Link
                    href={`/admin/bookings/${booking.booking_id}`}
                    className="flex flex-col gap-1.5 rounded-xl border border-admin-line px-3.5 py-3 text-sm hover:bg-admin-bg sm:flex-row sm:items-center sm:gap-3"
                  >
                    <Badge variant={badge.variant} className="self-start sm:self-auto">
                      {badge.label}
                    </Badge>
                    <span className="flex-1">
                      <b className="font-semibold">{booking.guest_name}</b>
                      <span className="text-muted">
                        {" "}
                        · {formatClassDate(booking.class_date).short} · {formatTime(booking.start_time)} ·{" "}
                        {formatPeso(Number(booking.total))}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-brown underline underline-offset-2">View</span>
                  </Link>
                </li>
              );
            })}
            {toMark.map((session) => (
              <li key={session.session_id}>
                <Link
                  href={`/admin/attendance?session=${session.session_id}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-admin-line px-3.5 py-3 text-sm hover:bg-admin-bg sm:flex-row sm:items-center sm:gap-3"
                >
                  <Badge variant="neutral" className="self-start sm:self-auto">
                    Mark attendance
                  </Badge>
                  <span className="flex-1">
                    <b className="font-semibold">
                      {formatClassDate(session.date).short} · {formatTimeRange(session.start_time, session.end_time)}
                    </b>
                    <span className="text-muted">
                      {" "}
                      · {session.to_mark} guest{session.to_mark === 1 ? "" : "s"} not marked yet
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-brown underline underline-offset-2">Open attendance</span>
                </Link>
              </li>
            ))}
          </ul>

          {needsCount > 0 && (
            <p className="text-xs text-muted">
              Check GCash / BPI screenshots in{" "}
              <Link href="/admin/payments?view=review" className="font-semibold text-brown underline underline-offset-2">
                Payments → Needs review
              </Link>
              . For a late payment, open the booking and use Cancel or transfer.
            </p>
          )}
          {summary.live_holds > 0 && (
            <p className="text-xs text-muted">
              {summary.live_holds} unpaid hold{summary.live_holds === 1 ? " is" : "s are"} paying right now. Holds
              free their seat by themselves when time runs out.
            </p>
          )}
        </AdminCard>
      </section>

      {/* ---- Quick links ---- */}
      <section aria-labelledby="links-heading" className="flex flex-col gap-3">
        <h2 id="links-heading" className="text-[15px] font-semibold lg:text-lg">
          Quick links
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
          <ButtonLink href="/admin/bookings" variant="secondary">
            <ClipboardList aria-hidden="true" className="size-4" />
            All bookings
          </ButtonLink>
          <ButtonLink href="/admin/walk-in" variant="secondary">
            <UserPlus aria-hidden="true" className="size-4" />
            Walk-in
          </ButtonLink>
          <ButtonLink href="/admin/attendance" variant="secondary">
            <ListChecks aria-hidden="true" className="size-4" />
            Attendance
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            <ExternalLink aria-hidden="true" className="size-4" />
            View website
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

// Picks the classes the Dashboard shows cards for: all of today's, plus the
// next few after today (cancelled ones skipped there).
// Takes: the classes loaded and today's date. Gives back: those classes.
function shownSessions(sessions: AdminSession[], today: string): AdminSession[] {
  const todays = sessions.filter((session) => session.date === today);
  const next = sessions
    .filter((session) => session.date > today && session.status !== "cancelled")
    .slice(0, NEXT_CLASSES);
  return [...todays, ...next];
}

// Picks one class's guests out of the combined roster list.
// Takes: all roster rows and a class id. Gives back: that class's rows.
function rosterOf(rosters: AdminRosterItem[], sessionId: string): AdminRosterItem[] {
  return rosters.filter((guest) => guest.session_id === sessionId);
}

// Says good morning / afternoon / evening, by the time in the Philippines.
// Takes: "now" in milliseconds. Gives back: e.g. "Good morning".
function greeting(nowMs: number): string {
  const hour = Number(
    new Date(nowMs).toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
