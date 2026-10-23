// Small helpers for the month navigator (◀ October 2026 ▶) on booking step 1
// and the transfer page (Change 17, Part F).
// Where it's used: src/app/(client)/book/page.tsx, the transfer page, and
// src/components/booking/ClassDayPicker.tsx.
// Months are written "YYYY-MM" and dates "YYYY-MM-DD", in Philippine time
// (the caller passes today's Philippine date). All the maths is done on the
// text or in UTC, so the visitor's own time zone can never shift a day.
// This file must not import anything: the unit tests (tests/unit/) load it
// directly with Node.

// The month a date is in.
// Takes: "2026-10-29". Gives back: "2026-10".
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// Moves a month forwards or backwards.
// Takes: "2026-12" and a number of months (negative = earlier).
// Gives back: e.g. addMonths("2026-12", 1) = "2027-01".
export function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return moved.toISOString().slice(0, 7);
}

// The first and last day of a month.
// Takes: "2026-02". Gives back: { first: "2026-02-01", last: "2026-02-28" }.
export function monthRange(month: string): { first: string; last: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  // Day 0 of the NEXT month = the last day of this one
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

// The months a client may look at: this month and next month only.
// Takes: today's date (Philippine time), "YYYY-MM-DD".
// Gives back: e.g. ["2026-10", "2026-11"].
export function bookableMonths(today: string): [string, string] {
  const current = monthOf(today);
  return [current, addMonths(current, 1)];
}

// Picks the month to show from what the address asked for.
// Takes: the month asked for ("YYYY-MM" or anything else), and the allowed
// months (from bookableMonths).
// Gives back: the asked month if it's allowed, otherwise null.
export function allowedMonth(asked: string | null | undefined, months: readonly string[]): string | null {
  return asked && /^\d{4}-\d{2}$/.test(asked) && months.includes(asked) ? asked : null;
}

// The month's name for the navigator.
// Takes: "2026-10". Gives back: "October 2026".
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}
