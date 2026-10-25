// The admin Dashboard: /admin
// Where it's used: admins land here after logging in; "Admin" in the client
// header and "Home" / "Dashboard" in the admin menu open it.
// Layout follows docs/designs/PhoneAdminDashboard.html (phone) in the admin
// frame (src/app/admin/layout.tsx).
//
// What it shows (all LIVE, loaded on every visit, never cached):
//   - number cards: today's seats taken / capacity, needs action, money paid
//     this week (and month), mat rental for the strays this month
//   - today's classes and the next classes (at most 2 cards each, with a
//     "View all" link to Schedule), each with who is booked, what to
//     prepare, and a Cancel class button
//   - "Needs action": payments to check, late payments, and classes whose
//     attendance hasn't been marked
//   - an overview grid (Version 1.4): one small card per admin page
//     (Bookings, Payments, Schedule, Users, Content) with its key numbers
//     and a "View full" link
//
// Protection: src/proxy.ts turns away guests and clients first, and
// requireAdmin() checks AGAIN on the server (the database's is_admin()).
// The database functions (migration 9) also refuse anyone who isn't an admin.

import { CalendarDays, ChevronRight, ClipboardList, FileText, Receipt, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader, StatCard } from "@/components/admin/AdminUi";
import { ClassCard } from "@/components/admin/ClassCard";
import { Badge } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/auth/user";
import { adminBookingStatusBadge } from "@/lib/booking-rules";
import {
  getAdminSessions,
  getClassRosters,
  getDashboardSummary,
  searchAdminBookings,
} from "@/lib/data/admin";
import { getAdminUsers, getAllSiteContent } from "@/lib/data/admin-setup";
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
import type {
  AdminBookingListItem,
  AdminDashboardSummary,
  AdminRosterItem,
  AdminSession,
  AdminUser,
  SiteContentRow,
} from "@/types/app";

export const metadata: Metadata = { title: "Admin Dashboard" };

// The most class cards under "Today's classes" and under "Next classes"
// (Version 1.4: "View all" opens Schedule for the rest).
const MAX_CARDS = 2;

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
// Gives back: the greeting, number cards, classes, needs action and the
// overview grid.
async function Dashboard() {
  const admin = await requireAdmin();

  let summary: AdminDashboardSummary;
  let sessions: AdminSession[];
  let needsAction: AdminBookingListItem[];
  let rosters: AdminRosterItem[];
  let upcoming: { rows: AdminBookingListItem[]; totalMatches: number };
  let clients: { rows: AdminUser[]; totalMatches: number };
  let content: SiteContentRow[];
  try {
    summary = await getDashboardSummary();
    const today = summary.today;
    // All at the same time: a week back (attendance still to mark) to two
    // weeks ahead (next classes), the bookings that need the admin, and the
    // numbers for the overview cards (next confirmed bookings, client
    // accounts, page text)
    [sessions, { rows: needsAction }, upcoming, clients, content] = await Promise.all([
      getAdminSessions(addDays(today, -7), addDays(today, 14)),
      searchAdminBookings({ statuses: ["awaiting_verification", "paid_needs_action"], when: "all", limit: 20 }),
      searchAdminBookings({ statuses: ["confirmed"], when: "upcoming", limit: 2 }),
      getAdminUsers("", "client"),
      getAllSiteContent(),
    ]);
    rosters = await getClassRosters(shownSessions(sessions, today).map((session) => session.session_id));
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals (e.g. redirects)
    console.error(error);
    return <AdminLoadError what="the dashboard" />;
  }

  const today = summary.today;
  const shown = shownSessions(sessions, today);
  const todays = shown.filter((session) => session.date === today);
  const next = shown.filter((session) => session.date > today);
  const toMark = sessions.filter((session) => session.to_mark > 0);
  const needsCount = summary.awaiting_verification + summary.paid_needs_action;
  const firstName = admin.fullName.split(" ")[0] || "there";

  return (
    <>
      <AdminPageHeader
        overline={formatClassDate(today).full}
        title={`${greeting(nowForThisVisit())}, ${firstName}`}
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
        <section aria-labelledby="today-heading" className="flex flex-col gap-3">
          <SectionHeading id="today-heading" href="/admin/schedule">
            Today&apos;s classes
          </SectionHeading>
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
          <SectionHeading id="next-heading" href="/admin/schedule">
            Next classes
          </SectionHeading>
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
                {/* Attendance is marked on each booking's page (Version 1.4
                    removed the Attendance list), so open that class's
                    confirmed bookings */}
                <Link
                  href={`/admin/bookings?status=confirmed&date=${session.date}&time=${session.start_time}`}
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
                  <span className="text-xs font-semibold text-brown underline underline-offset-2">Open bookings</span>
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
              . For a late payment, open the booking and follow the steps there.
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

      {/* ---- Overview: one small card per admin page (Version 1.4) ---- */}
      <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
        <h2 id="overview-heading" className="text-[15px] font-semibold lg:text-lg">
          Overview
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            icon={ClipboardList}
            title="Bookings"
            href="/admin/bookings"
            stats={[
              { value: String(upcoming.totalMatches), label: "upcoming confirmed" },
              { value: String(needsCount), label: "need action" },
            ]}
            items={upcoming.rows.map((booking) => ({
              key: booking.booking_id,
              text: `${booking.guest_name} · ${formatClassDate(booking.class_date).short}, ${formatTime(booking.start_time)}`,
            }))}
            empty="No upcoming confirmed bookings."
          />
          <ModuleCard
            icon={Receipt}
            title="Payments"
            href="/admin/payments"
            stats={[
              { value: formatPeso(Number(summary.paid_this_month)), label: "paid this month" },
              { value: String(summary.awaiting_verification), label: "transfers to check" },
            ]}
          />
          <ModuleCard
            icon={CalendarDays}
            title="Schedule"
            href="/admin/schedule"
            stats={scheduleStats(sessions, today)}
          />
          <ModuleCard
            icon={Users}
            title="Users"
            href="/admin/users"
            stats={[
              { value: String(clients.totalMatches), label: "client accounts" },
              { value: String(clients.rows.filter((user) => !user.is_active).length), label: "deactivated" },
            ]}
            items={newestClients(clients.rows).map((user) => ({
              key: user.user_id,
              text: `${user.full_name || user.email || "Client"} · joined ${formatClassDate(manilaDateString(new Date(user.created_at).getTime())).short}`,
            }))}
            empty="No client accounts yet."
          />
          <ModuleCard
            icon={FileText}
            title="Content"
            href="/admin/content"
            stats={[{ value: String(content.length), label: "text blocks" }]}
            items={lastEdited(content).map((row) => ({
              key: row.id,
              text: `Last edit: ${row.page} / ${row.section} · ${formatManilaDateTime(row.updated_at)}`,
            }))}
            empty="No page text yet."
          />
        </div>
      </section>
    </>
  );
}

// Picks the classes the Dashboard shows cards for: the first 2 of today's,
// plus the next 2 after today (cancelled ones skipped there).
// Takes: the classes loaded and today's date. Gives back: those classes.
function shownSessions(sessions: AdminSession[], today: string): AdminSession[] {
  const todays = sessions.filter((session) => session.date === today).slice(0, MAX_CARDS);
  const next = sessions
    .filter((session) => session.date > today && session.status !== "cancelled")
    .slice(0, MAX_CARDS);
  return [...todays, ...next];
}

// The numbers on the Schedule overview card.
// Takes: the classes loaded (a week back to two weeks ahead) and today.
// Gives back: how many open classes are coming up in the next two weeks and
// how many seats they still have free.
function scheduleStats(sessions: AdminSession[], today: string): ModuleStat[] {
  const coming = sessions.filter((session) => session.date >= today && session.status === "open" && !session.has_ended);
  const free = coming.reduce((sum, session) => sum + session.seats_left, 0);
  return [
    { value: String(coming.length), label: "open classes, next 2 weeks" },
    { value: String(free), label: "seats still free" },
  ];
}

// The 2 newest client accounts, for the Users overview card.
// Takes: the client accounts (sorted by name). Gives back: the newest 2.
function newestClients(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_CARDS);
}

// The page text block that was edited last, for the Content overview card.
// Takes: every site_content row. Gives back: a list with that one row
// (empty if there's no text at all).
function lastEdited(rows: SiteContentRow[]): SiteContentRow[] {
  const newest = rows.reduce<SiteContentRow | null>(
    (best, row) => (!best || row.updated_at > best.updated_at ? row : best),
    null,
  );
  return newest ? [newest] : [];
}

// A section title with a "View all" link on its right.
// Takes: the heading id (for aria-labelledby), where "View all" goes, and
// the title text. Gives back: the heading row.
function SectionHeading({ id, href, children }: { id: string; href: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold lg:text-lg">
        {children}
      </h2>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-brown hover:underline"
      >
        View all
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

// One number on an overview card, e.g. { value: "12", label: "client accounts" }.
type ModuleStat = { value: string; label: string };

// One small overview card for an admin page.
// Takes: the icon, title, the page it opens, 1-2 numbers, and optionally a
// short list of recent items (with the text to show when the list is empty).
// Gives back: a white card with a "View full" link to the page.
function ModuleCard({
  icon: Icon,
  title,
  href,
  stats,
  items,
  empty,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  stats: ModuleStat[];
  items?: { key: string; text: string }[];
  empty?: string;
}) {
  return (
    <AdminCard className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <span className="flex size-8 items-center justify-center rounded-lg bg-admin-bg text-brown">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          {title}
        </h3>
        <Link
          href={href}
          aria-label={`View full ${title}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-brown hover:underline"
        >
          View full
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="font-heading text-xl font-semibold text-brown">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {items && (
        <ul className="flex flex-col gap-1 border-t border-admin-line pt-2.5 text-xs text-muted">
          {items.length === 0 && <li>{empty}</li>}
          {items.map((item) => (
            <li key={item.key} className="truncate">
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
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
