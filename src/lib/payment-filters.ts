// The Filter on My Account > Payments (Change 17, Part G).
// Where it's used: src/app/(client)/account/payments/page.tsx.
//
// The filters live in the page address (a normal GET form), so they work
// without JavaScript and a filtered list can be bookmarked:
//   ?status=  all | paid | checking | rejected | refunded
//   ?method=  all | gcash | maya | card | bpi | cash
//   ?when=    all | this_month | last_month | last_3_months | custom
//   ?from= / ?to=  "YYYY-MM-DD" (only for when=custom; either may be empty)
// A payment's date is its PAYMENT DATE: when it was paid, or (for one being
// checked) when it was sent, in Philippine time.
// Anything unknown in the address is simply ignored ("all").
// This file must not import anything at run time: the unit tests
// (tests/unit/) load it directly with Node. (The type import below is
// removed when the file runs.)

import type { MyPayment } from "@/types/app";

// The choices for each filter, with the words the Filter panel shows.
export const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "checking", label: "Being checked" },
  { value: "rejected", label: "Not approved" },
  { value: "refunded", label: "Refunded" },
] as const;
export const METHOD_FILTERS = [
  { value: "all", label: "All methods" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
  { value: "bpi", label: "BPI transfer" },
  { value: "cash", label: "Cash" },
] as const;
export const WHEN_FILTERS = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "custom", label: "Pick dates" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type MethodFilter = (typeof METHOD_FILTERS)[number]["value"];
type WhenFilter = (typeof WHEN_FILTERS)[number]["value"];

// The filters as the page uses them.
export type PaymentFilters = {
  status: StatusFilter;
  method: MethodFilter;
  when: WhenFilter;
  from: string | null; // "YYYY-MM-DD" (custom only)
  to: string | null;
};

// The payment fields the filter looks at.
type FilterablePayment = Pick<MyPayment, "status" | "provider" | "method" | "paid_at" | "created_at">;

// Reads one value from the address if it's one of the allowed ones.
// Takes: the value and the allowed list. Gives back: the value, or "all".
function pick<T extends string>(value: string | null | undefined, allowed: readonly { value: T }[]): T {
  const found = allowed.find((item) => item.value === value);
  return found ? found.value : ("all" as T);
}

// A real "YYYY-MM-DD" date, or null.
// Takes: the text from the address. Gives back: the date or null.
function cleanDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// Reads the filters from the page address.
// Takes: the four values (?status, ?method, ?when, ?from, ?to) as text.
// Gives back: PaymentFilters (unknown values become "all"; bad dates are dropped;
// from and to are swapped if they're the wrong way round).
export function readPaymentFilters(params: {
  status?: string | null;
  method?: string | null;
  when?: string | null;
  from?: string | null;
  to?: string | null;
}): PaymentFilters {
  const when = pick(params.when, WHEN_FILTERS);
  let from = when === "custom" ? cleanDate(params.from) : null;
  let to = when === "custom" ? cleanDate(params.to) : null;
  if (from && to && from > to) [from, to] = [to, from];
  return { status: pick(params.status, STATUS_FILTERS), method: pick(params.method, METHOD_FILTERS), when, from, to };
}

// How many filters are switched on (for the "Filter (2)" button).
// Takes: the filters. Gives back: 0 to 3.
export function activeFilterCount(filters: PaymentFilters): number {
  const dates = filters.when !== "all" && (filters.when !== "custom" || filters.from || filters.to);
  return (filters.status !== "all" ? 1 : 0) + (filters.method !== "all" ? 1 : 0) + (dates ? 1 : 0);
}

// The payment date of a payment, in the Philippines.
// Takes: the payment. Gives back: "YYYY-MM-DD" (paid_at, else created_at).
export function paymentDay(payment: Pick<MyPayment, "paid_at" | "created_at">): string {
  return new Date(payment.paid_at ?? payment.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// The first day of a month some months before (or after) a date's month.
// Takes: "YYYY-MM-DD" and a number of months (negative = earlier).
// Gives back: "YYYY-MM-01".
function monthStart(today: string, monthsAway: number): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + monthsAway, 1)).toISOString().slice(0, 10);
}

// The date range a "when" choice means.
// Takes: the filters and today ("YYYY-MM-DD", Philippine time).
// Gives back: { from, to } (inclusive; null = no limit on that side).
export function filterDateRange(filters: PaymentFilters, today: string): { from: string | null; to: string | null } {
  switch (filters.when) {
    case "this_month":
      return { from: monthStart(today, 0), to: null };
    case "last_month": {
      // The day before this month's first day = the end of last month
      const end = new Date(`${monthStart(today, 0)}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      return { from: monthStart(today, -1), to: end.toISOString().slice(0, 10) };
    }
    case "last_3_months":
      // This month and the two before it
      return { from: monthStart(today, -2), to: null };
    case "custom":
      return { from: filters.from, to: filters.to };
    default:
      return { from: null, to: null };
  }
}

// Keeps the payments that match every filter.
// Takes: the payments, the filters and today ("YYYY-MM-DD", Philippine time).
// Gives back: the matching payments, in the same order.
//   "checking" = a manual transfer the cafe hasn't approved yet (status pending)
export function filterPayments<T extends FilterablePayment>(payments: T[], filters: PaymentFilters, today: string): T[] {
  const range = filterDateRange(filters, today);
  return payments.filter((payment) => {
    if (filters.status === "checking" && payment.status !== "pending") return false;
    if (filters.status !== "all" && filters.status !== "checking" && payment.status !== filters.status) return false;
    if (filters.method !== "all" && payment.method !== filters.method) return false;
    const day = paymentDay(payment);
    if (range.from && day < range.from) return false;
    if (range.to && day > range.to) return false;
    return true;
  });
}
