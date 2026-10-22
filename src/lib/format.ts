// Helpers that turn database values into friendly text (money, dates, times).
// Where it's used: any page or component that shows prices or class times.
//
// Class dates and times in the database are already Philippine time
// (Asia/Manila), e.g. date "2026-10-23" and start_time "09:00:00". We only
// re-format that text; we never convert time zones here, so a class always
// shows the time the cafe set, whatever time zone the visitor's device is in.

// Formats pesos for display.
// Takes: an amount in pesos, e.g. 500 or 549.5.
// Gives back: "₱500" (no ".00" for whole pesos) or "₱549.50".
export function formatPeso(amount: number): string {
  const hasCentavos = !Number.isInteger(amount);
  return (
    "₱" +
    amount.toLocaleString("en-PH", {
      minimumFractionDigits: hasCentavos ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

// Splits "09:00:00" into hours and minutes and says AM or PM.
// Takes: a time from the database ("HH:MM" or "HH:MM:SS", 24-hour clock).
// Gives back: { text: "9:00", period: "AM" }.
function toTwelveHour(time: string): { text: string; period: "AM" | "PM" } {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12; // 0 -> 12 AM, 13 -> 1 PM
  return { text: `${hour12}:${minuteText}`, period };
}

// Formats one time of day.
// Takes: a time from the database or settings, e.g. "08:00" or "10:15:00".
// Gives back: "8:00 AM" or "10:15 AM". Text that isn't a time is given back
// unchanged, so a typo in settings never breaks the page.
export function formatTime(time: string): string {
  if (!/^\d{1,2}:\d{2}/.test(time)) return time;
  const { text, period } = toTwelveHour(time);
  return `${text} ${period}`;
}

// Formats a class's start and end time.
// Takes: start and end times from the database, e.g. "09:00:00", "09:50:00".
// Gives back: "9:00 – 9:50 AM", or "11:30 AM – 12:20 PM" when AM/PM differ.
export function formatTimeRange(start: string, end: string): string {
  const from = toTwelveHour(start);
  const to = toTwelveHour(end);
  if (from.period === to.period) {
    return `${from.text} – ${to.text} ${to.period}`;
  }
  return `${from.text} ${from.period} – ${to.text} ${to.period}`;
}

// Breaks a class date into the parts the date tile shows.
// Takes: a date from the database, "YYYY-MM-DD".
// Gives back: { weekday: "THU", day: "23", month: "Oct",
// full: "Thursday, October 23", short: "Thu, Oct 23" }.
export function formatClassDate(date: string): {
  weekday: string;
  day: string;
  month: string;
  full: string;
  short: string;
} {
  const [year, month, day] = date.split("-").map(Number);
  // Build the date in UTC and format it in UTC, so the visitor's own time
  // zone can never shift it to the day before or after.
  const value = new Date(Date.UTC(year, month - 1, day));
  const format = (options: Intl.DateTimeFormatOptions) =>
    value.toLocaleDateString("en-PH", { timeZone: "UTC", ...options });

  return {
    weekday: format({ weekday: "short" }).toUpperCase(),
    day: String(day),
    month: format({ month: "short" }),
    full: format({ weekday: "long", day: "numeric", month: "long" }),
    short: format({ weekday: "short", day: "numeric", month: "short" }),
  };
}

// Formats an exact moment from the database (e.g. when a payment was made or
// a voucher expires) as a date in the Philippines.
// Takes: the moment (text like "2026-12-22T07:15:00+00:00", or a Date).
// Gives back: e.g. "December 22, 2026". Always Philippine time, whatever time
// zone the visitor's device (or our server) is in.
export function formatManilaDate(moment: string | Date): string {
  return new Date(moment).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Formats an exact moment as a short date and time in the Philippines.
// Takes: the moment (text or a Date).
// Gives back: e.g. "Fri, Oct 24, 9:00 AM".
export function formatManilaDateTime(moment: string | Date): string {
  return new Date(moment).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Day names, in the database's numbering (0 = Sunday ... 6 = Saturday).
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Gives the name of a day of the week.
// Takes: the day number (0 = Sunday ... 6 = Saturday), and "long" or "short".
// Gives back: "Thursday" or "Thu".
export function weekdayName(weekday: number, length: "long" | "short" = "long"): string {
  const name = WEEKDAY_NAMES[weekday] ?? "";
  return length === "short" ? name.slice(0, 3) : name;
}

// Describes a set of class days in a few words.
// Takes: day numbers, already in week order (Monday first), e.g. [4, 5, 6, 0].
// Gives back: "Thu to Sun" for days in a row (3 or more), "Sat and Sun" for
// two, or "Thu, Sat and Sun" when there are gaps. "" if there are no days.
export function formatWeekdays(weekdays: number[]): string {
  const names = weekdays.map((day) => weekdayName(day, "short"));
  if (names.length <= 1) return names[0] ?? "";

  // Are the days one after the other? Compare positions in a Monday-first week.
  const positions = weekdays.map((day) => (day + 6) % 7);
  const inARow = positions.every((pos, i) => i === 0 || pos === positions[i - 1] + 1);
  if (inARow && names.length >= 3) return `${names[0]} to ${names[names.length - 1]}`;

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Works out how long a class is, in minutes.
// Takes: start and end times, e.g. "09:00:00" and "09:50:00".
// Gives back: 50.
export function minutesBetween(start: string, end: string): number {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}

// Makes the 1–2 letters shown in a round avatar (e.g. in the header).
// Takes: the person's full name, and their email as a backup.
// Gives back: e.g. "JS" for "James Soriano", "B" for "Bea", or the first
// letter of the email if there's no name yet.
export function initialsOf(fullName: string, email: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (email.trim()[0] ?? "?").toUpperCase();
  const first = words[0][0];
  // Use the LAST word for the second letter ("Maria Clara Santos" -> "MS")
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Gives the date in the Philippines for an exact moment.
// Takes: milliseconds since 1970 (e.g. from nowForThisVisit()).
// Gives back: "YYYY-MM-DD" in Asia/Manila, e.g. "2026-10-23", the same shape
// as class dates in the database. ("en-CA" is simply a locale that writes
// dates as YYYY-MM-DD.)
export function manilaDateString(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Moves a date forwards or backwards by whole days.
// Takes: a date "YYYY-MM-DD" and a number of days (negative = earlier).
// Gives back: the new date, "YYYY-MM-DD". Worked out in UTC, so no time zone
// or daylight saving can shift it.
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
