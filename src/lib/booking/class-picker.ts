// Works out what the month navigator + date chips show (Change 17, Part F).
// Where it's used: booking step 1 (src/app/(client)/book/page.tsx) and, from
// Part G, the transfer page. The result goes to ClassDayPicker
// (src/components/booking/ClassDayPicker.tsx).
//
// It only ORGANISES the classes the page loaded (today to the end of next
// month, from get_open_sessions()). Which classes can be booked is decided by
// the database (is_bookable, seats_left, state), never here.

import type { PickerDay, PickerMonths } from "@/components/booking/ClassDayPicker";
import { seatBadge } from "@/lib/booking-rules";
import { formatClassDate, formatTimeRange } from "@/lib/format";
import { allowedMonth, formatMonth, monthOf } from "@/lib/month";
import type { OpenSession } from "@/types/app";

// What buildClassPicker() needs.
type ClassPickerInput = {
  sessions: OpenSession[]; // the classes, earliest first
  months: readonly [string, string]; // this month and next month ("YYYY-MM")
  askedMonth: string | null | undefined; // ?show_month= / ?month= from the address
  askedDate: string | null | undefined; // ?date= from the address
  pickedSessionId: string | null | undefined; // ?session= from the address
};

// What it gives back.
export type ClassPicker = {
  months: PickerMonths; // for the ◀ month ▶ bar
  days: PickerDay[]; // the shown month's dates with classes
  initialDate: string | null; // the date chip to start on
  preselectedId: string | null; // a class to tick already (only if it can still be booked)
  monthSessionIds: Set<string>; // every class id in the shown month
};

// Builds the month navigator, the chips and the classes for one month.
// Takes: the input above.
// Gives back: the ClassPicker above. The month shown is, in order:
//   1. the month the address asked for (if it's this month or next month)
//   2. the month of the class already picked (?session=)
//   3. this month, if anything in it can still be booked
//   4. otherwise next month, if it has classes (e.g. on the 31st, after the cutoff)
//   5. otherwise this month (it then says "no classes yet")
// The date chip shown first: ?date= (if that date has classes), else the
// picked class's date, else the first date with a free seat, else the first date.
export function buildClassPicker({
  sessions,
  months,
  askedMonth,
  askedDate,
  pickedSessionId,
}: ClassPickerInput): ClassPicker {
  // A class picked in the address counts only if it can still be booked
  const picked = sessions.find((s) => s.session_id === pickedSessionId && s.is_bookable) ?? null;
  const has = (month: string, onlyBookable: boolean) =>
    sessions.some((s) => monthOf(s.date) === month && (!onlyBookable || s.is_bookable));

  const month =
    allowedMonth(askedMonth, months) ??
    (picked ? allowedMonth(monthOf(picked.date), months) : null) ??
    (has(months[0], true) ? months[0] : has(months[1], false) ? months[1] : months[0]);

  // The shown month's classes, grouped by date
  const inMonth = sessions.filter((s) => monthOf(s.date) === month);
  const days = groupIntoDays(inMonth);

  const preselectedId = picked && monthOf(picked.date) === month ? picked.session_id : null;
  const hasDay = (date: string | null | undefined) => Boolean(date && days.some((day) => day.date === date));
  const initialDate =
    (hasDay(askedDate) ? askedDate : null) ??
    (picked && preselectedId ? picked.date : null) ??
    days.find((day) => day.anyBookable)?.date ??
    days[0]?.date ??
    null;

  return {
    months: {
      current: month,
      label: formatMonth(month),
      // Only this month and next month: each one points to the other
      previous: month === months[1] ? months[0] : null,
      next: month === months[0] ? months[1] : null,
    },
    days,
    initialDate,
    preselectedId,
    monthSessionIds: new Set(inMonth.map((s) => s.session_id)),
  };
}

// Puts one month's classes into dates, ready for the chips.
// Takes: the classes, earliest first.
// Gives back: one PickerDay per date that has at least one class (in any
// state), in the same order. EVERY class given is kept (none are dropped).
export function groupIntoDays(sessions: OpenSession[]): PickerDay[] {
  const days: PickerDay[] = [];
  for (const session of sessions) {
    let day = days[days.length - 1];
    if (!day || day.date !== session.date) {
      const label = formatClassDate(session.date);
      day = {
        date: session.date,
        weekday: label.weekday, // "THU"
        day: label.day, // "29"
        full: label.full, // "Thursday, 29 October"
        anyBookable: false,
        sessions: [],
      };
      days.push(day);
    }
    day.anyBookable ||= session.is_bookable;
    day.sessions.push({
      id: session.session_id,
      time: formatTimeRange(session.start_time, session.end_time),
      badge: seatBadge(session.seats_left, session.state, session.capacity),
      bookable: session.is_bookable,
    });
  }
  return days;
}
