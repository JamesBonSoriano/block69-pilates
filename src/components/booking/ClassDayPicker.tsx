"use client";
// The month navigator + date chips + that date's classes (Change 17, Part F),
// like the reference design:
//
//       ◀  October 2026  ▶
//   [THU 29] [FRI 30] [SAT 31] ...        <- only dates that HAVE classes
//   Thursday, 29 October
//   ( ) 9:00 – 9:50 AM    Mindful Mat Pilates · Beginner   [3 of 4 left]
//   ( ) 10:15 – 11:05 AM  ...                              [Fully booked]
//
// Where it's used: booking step 1 (src/app/(client)/book/page.tsx) and, from
// Part G, the transfer page. The page loads ONE month of classes on the
// server and hands them over; this component only shows them.
//
// "use client" = tapping a date chip shows that date's classes straight
// away. Every class of the month is in the page (the other dates are just
// hidden), so a class picked on one date stays picked when another date is
// looked at, and the form always sends the picked class.
// WITHOUT JavaScript it still works: the chips and the arrows are real submit
// buttons that reload the page with ?date= or ?show_month= (formAction), and
// formNoValidate lets them through without a class picked yet.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { cn } from "@/lib/cn";

// One class, ready to show (worked out on the server).
export type PickerSession = {
  id: string;
  time: string; // e.g. "9:00 – 9:50 AM"
  badge: { label: string; variant: BadgeVariant }; // "3 of 4 left", "Fully booked"...
  bookable: boolean; // false = greyed out, can't be picked
};

// One date with classes.
export type PickerDay = {
  date: string; // "YYYY-MM-DD"
  weekday: string; // "THU"
  day: string; // "29"
  full: string; // "Thursday, 29 October"
  anyBookable: boolean; // false = every class that day is full / closed
  sessions: PickerSession[];
};

// The month navigator above the chips.
export type PickerMonths = {
  current: string; // "YYYY-MM", sent along so a date chip stays in this month
  label: string; // "October 2026"
  previous: string | null; // the month the ◀ arrow opens (null = can't go back)
  next: string | null; // the month the ▶ arrow opens (null = can't go further)
};

type ClassDayPickerProps = {
  months: PickerMonths;
  days: PickerDay[]; // the month's dates with classes, earliest first
  initialDate: string | null; // the date to show first
  initialSessionId: string | null; // a class already picked
  radioName: string; // the form field the picked class is sent as ("session" / "session_id")
  reloadAction: string; // the page's own address, for the no-JavaScript buttons
  emptyText: string; // shown when the month has no classes
};

// The picker.
// Takes: the props above.
// Gives back: the month navigator, the chips, and the picked date's classes
// (every date's classes are in the page; the others are hidden).
export function ClassDayPicker({
  months,
  days,
  initialDate,
  initialSessionId,
  radioName,
  reloadAction,
  emptyText,
}: ClassDayPickerProps) {
  // The date being looked at
  const [date, setDate] = useState(initialDate ?? days[0]?.date ?? null);

  // A chip was tapped (with JavaScript): show that date, don't reload.
  // Takes: the click and the chip's date.
  function showDate(event: MouseEvent<HTMLButtonElement>, chipDate: string) {
    event.preventDefault();
    setDate(chipDate);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* The month this page is showing (a date chip sends it along) */}
      <input type="hidden" name="month" value={months.current} />

      {/* ===== ◀ October 2026 ▶ ===== */}
      <div className="flex items-center justify-between gap-3 rounded-full border border-line bg-card p-1">
        <MonthArrow direction="previous" month={months.previous} reloadAction={reloadAction} />
        <h2 aria-live="polite" className="font-heading text-lg font-semibold">
          {months.label}
        </h2>
        <MonthArrow direction="next" month={months.next} reloadAction={reloadAction} />
      </div>

      {days.length === 0 ? (
        <p className="rounded-[20px] border border-line bg-card p-5 text-sm text-muted">{emptyText}</p>
      ) : (
        <>
          {/* ===== Date chips: only the dates that have classes =====
              Phones: one row that scrolls sideways inside its own box */}
          <div role="group" aria-label={`Dates with classes in ${months.label}`} className="-mx-5 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
            <ul className="flex gap-2 lg:flex-wrap">
              {days.map((day) => {
                const selected = day.date === date;
                return (
                  <li key={day.date} className="shrink-0">
                    <button
                      type="submit"
                      name="date"
                      value={day.date}
                      formAction={reloadAction}
                      formNoValidate
                      onClick={(event) => showDate(event, day.date)}
                      aria-pressed={selected}
                      // Screen readers hear the whole date, and when it's full
                      aria-label={`${day.full}${day.anyBookable ? "" : ", no free seats"}`}
                      className={cn(
                        "flex min-h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        selected
                          ? "border-primary bg-primary text-on-primary"
                          : "border-line bg-white text-ink hover:border-primary",
                        // A date with nothing to book is faded (still tappable, to see why)
                        !day.anyBookable && !selected && "opacity-55",
                      )}
                    >
                      <span aria-hidden="true" className="text-[11px] font-semibold tracking-wide">
                        {day.weekday}
                      </span>
                      <span aria-hidden="true" className="font-heading text-xl font-semibold leading-none">
                        {day.day}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ===== The classes of each date (only the picked date shows) ===== */}
          {days.map((day) => (
            <div key={day.date} hidden={day.date !== date} className="rounded-[20px] border border-line bg-card p-4 lg:p-5">
              <RadioGroup legend={day.full} name={`day-${day.date}`} legendStyle="heading">
                {day.sessions.map((session) => (
                  <RadioOption
                    key={session.id}
                    // Every class of the month shares one name, so only ONE can be picked
                    name={radioName}
                    value={session.id}
                    required
                    disabled={!session.bookable}
                    defaultChecked={session.id === initialSessionId && session.bookable}
                    label={session.time}
                    description="Mindful Mat Pilates · Beginner"
                    aside={<Badge variant={session.badge.variant}>{session.badge.label}</Badge>}
                  />
                ))}
              </RadioGroup>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// One arrow of the month navigator.
// Takes: which arrow, the month it opens (null = none), and the page address.
// Gives back: a round submit button that reloads the page with
// ?show_month=YYYY-MM (keeping the picked class and the mat tick, which are
// in the same form), or a greyed-out one that does nothing.
function MonthArrow({
  direction,
  month,
  reloadAction,
}: {
  direction: "previous" | "next";
  month: string | null;
  reloadAction: string;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = direction === "previous" ? "Previous month" : "Next month";
  return (
    <button
      type="submit"
      name="show_month"
      value={month ?? ""}
      formAction={reloadAction}
      formNoValidate
      disabled={!month}
      aria-label={month ? label : `${label} (only this month and next month can be booked)`}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-brown hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
