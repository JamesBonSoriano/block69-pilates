// The Sort choices on admin lists (Version 1.9):
//   Earnings  Newest / Oldest payment first  (?sort=oldest)
//   Schedule  Date: soonest / latest first   (?sort=desc)
// Where it's used: src/app/admin/(panel)/earnings/page.tsx and
// src/app/admin/(panel)/schedule/page.tsx. The DATABASE does the sorting
// (admin_list_payments p_sort, admin_upcoming_classes p_sort, migration
// 20261121000006), because the lists are split into pages there.
// Kept in its own file (no "@/" imports) so tests/unit/admin-sort.test.mjs
// can load it directly with Node.

// The Earnings sort choices, in the order the box shows them.
export const EARNINGS_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

// The Schedule sort choices, in the order the box shows them.
export const SCHEDULE_SORT_OPTIONS = [
  { value: "asc", label: "Date: soonest first" },
  { value: "desc", label: "Date: latest first" },
] as const;

// One Earnings choice.
export type EarningsSort = (typeof EARNINGS_SORT_OPTIONS)[number]["value"];
// One Schedule choice.
export type ScheduleSort = (typeof SCHEDULE_SORT_OPTIONS)[number]["value"];

// Reads the Earnings ?sort= value.
// Takes: anything from the address.
// Gives back: "oldest" only for exactly "oldest"; anything else (missing,
// junk) is the default, "newest".
export function cleanEarningsSort(value: unknown): EarningsSort {
  return value === "oldest" ? "oldest" : "newest";
}

// Reads the Schedule ?sort= value.
// Takes: anything from the address.
// Gives back: "desc" only for exactly "desc"; anything else is the default,
// "asc" (the next class first).
export function cleanScheduleSort(value: unknown): ScheduleSort {
  return value === "desc" ? "desc" : "asc";
}

// Builds a Schedule page address that keeps the sort.
// Takes: the page number and the sort.
// Gives back: e.g. "/admin/schedule", "/admin/schedule?page=2" or
// "/admin/schedule?sort=desc&page=3" (defaults are left out).
export function scheduleHref(page: number, sort: ScheduleSort): string {
  const query = new URLSearchParams();
  if (sort === "desc") query.set("sort", "desc");
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/admin/schedule?${search}` : "/admin/schedule";
}
