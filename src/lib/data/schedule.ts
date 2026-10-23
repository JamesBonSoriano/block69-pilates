// Reads the WEEKLY class pattern (schedule_templates table): which days have
// classes, at what times, and how many seats each one starts with.
// Where it's used: Home (the "Thu to Sun" line) and About Us (the schedule
// list and the class facts: length and group size).
//
// This is the PATTERN, not the dated classes. Seats left for real dates come
// from get_open_sessions() (src/lib/data/sessions.ts), which is never cached.
//
// CACHING (Next.js "use cache"):
//   The pattern almost never changes and is the same for everyone.
//   - cacheLife("hours"): re-read from Supabase in the background at most
//     once an hour.
//   - cacheTag("schedule"): when the admin saves Schedule Management
//     (saveTemplate / addTemplate), it calls updateTag("schedule") so the new days
//     and times show straight away.

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// One class time in the weekly pattern.
export type ScheduleSlot = {
  startTime: string; // "09:00:00" (Philippine time)
  endTime: string; // "09:50:00"
  capacity: number; // default seats, e.g. 4
};

// One day of the week that has classes.
export type ScheduleDay = {
  weekday: number; // 0 = Sunday ... 6 = Saturday (same as the database)
  slots: ScheduleSlot[]; // earliest first
};

// Loads the active weekly pattern (cached, see the note at the top).
// Takes: nothing.
// Gives back: the days that have classes, Monday first (so Thu, Fri, Sat,
// Sun), each with its class times. Throws if Supabase can't be reached.
export async function getWeeklySchedule(): Promise<ScheduleDay[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("schedule");

  const supabase = createPublicClient();

  // Everyone may read the weekly pattern (RLS policy "Anyone can read
  // schedule templates"). Templates switched off by the admin are skipped.
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("weekday, start_time, end_time, default_capacity")
    .eq("is_active", true)
    .order("start_time");

  if (error) {
    throw new Error(`Could not load the weekly schedule: ${error.message}`);
  }

  // Group the rows by day: { 4: [9:00 slot, 10:15 slot], 5: [...], ... }
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const row of data) {
    const slots = byDay.get(row.weekday) ?? [];
    slots.push({
      startTime: row.start_time,
      endTime: row.end_time,
      capacity: row.default_capacity,
    });
    byDay.set(row.weekday, slots);
  }

  // Sort the days Monday first: (weekday + 6) % 7 turns Mon..Sun into 0..6,
  // so Sunday (0) comes last instead of first.
  return [...byDay.entries()]
    .map(([weekday, slots]) => ({ weekday, slots }))
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
}
