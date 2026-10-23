// Walk-in booking: /admin/walk-in   (or /admin/walk-in?session=<class id>)
// Where it's used: the admin menu and tab bar, the Dashboard's "Walk-in"
// buttons (which pick that class), and the Bookings page.
// Layout follows docs/designs/AdminWalkIn.html.
//
// It lists the classes from today for two weeks that haven't ended and
// aren't closed or cancelled (full ones greyed out), with LIVE seats left.
// The form itself is src/components/admin/WalkInForm.tsx.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check (admin_walkin_booking, migration 3).

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { WalkInForm, type WalkInDay } from "@/components/admin/WalkInForm";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { getAdminSessions } from "@/lib/data/admin";
import { getPublicSettings } from "@/lib/data/settings";
import { addDays, formatClassDate, formatTimeRange, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminSession } from "@/types/app";

export const metadata: Metadata = { title: "Walk-in booking · Admin" };

// The Walk-in page.
// Takes: searchParams (?session=<id> picks that class).
// Gives back: the heading, then the live form inside <Suspense>.
export default function WalkInPage({ searchParams }: PageProps<"/admin/walk-in">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Bookings"
        title="Walk-in booking"
        intro="For guests who book at the counter or by message. It takes a seat from the same pool as online bookings."
      />
      <Suspense fallback={<AdminLoading label="the classes" />}>
        <WalkInLoader searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: loads the classes and settings, then shows the form.
// Takes: the searchParams promise.
// Gives back: the form with the classes grouped by day.
async function WalkInLoader({ searchParams }: { searchParams: PageProps<"/admin/walk-in">["searchParams"] }) {
  await requireAdmin();
  const wanted = firstParam((await searchParams).session);
  const today = manilaDateString(nowForThisVisit());

  let sessions: AdminSession[];
  let settings;
  try {
    [sessions, settings] = await Promise.all([getAdminSessions(today, addDays(today, 13)), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the classes" />;
  }

  // Only open classes that haven't ended can take a walk-in
  const usable = sessions.filter((session) => session.status === "open" && !session.has_ended);

  // Group them by day for the form
  const days: WalkInDay[] = [];
  for (const session of usable) {
    const dateLabel = session.date === today ? `Today, ${formatClassDate(session.date).short}` : formatClassDate(session.date).full;
    let day = days.find((item) => item.dateLabel === dateLabel);
    if (!day) {
      day = { dateLabel, classes: [] };
      days.push(day);
    }
    day.classes.push({
      sessionId: session.session_id,
      timeLabel: formatTimeRange(session.start_time, session.end_time),
      seatsLabel: session.seats_left > 0 ? `${session.seats_left} of ${session.capacity} seats left` : "Full",
      disabled: session.seats_left <= 0,
    });
  }

  // The class to pick first: the one in the address if it has a seat,
  // otherwise the first class with a seat
  const free = usable.filter((session) => session.seats_left > 0);
  const defaultSessionId =
    free.find((session) => session.session_id === wanted)?.session_id ?? free[0]?.session_id ?? null;

  return (
    <WalkInForm
      days={days}
      defaultSessionId={defaultSessionId}
      drinkOptions={settings.drinkOptions}
      classPrice={settings.classPrice}
      matPrice={settings.matPrice}
    />
  );
}
