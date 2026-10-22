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
// Gives back: { weekday: "THU", day: "23", month: "Oct", full: "Thursday, 23 October" }.
export function formatClassDate(date: string): {
  weekday: string;
  day: string;
  month: string;
  full: string;
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
  };
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
