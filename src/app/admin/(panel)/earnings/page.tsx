// Admin Earnings (view only): /admin/earnings
// (Version 1.6 renamed "Payments" to "Earnings"; /admin/payments redirects
// here, see next.config.ts.)
// Where it's used: the admin menu ("Earnings") and the Dashboard's Earnings card.
// Layout follows docs/designs/AdminPayments.html: number cards (today, this
// week, this month and the mat rental donations, from
// admin_billing_summary), earnings by week, then the payments table with
// filters (search, method, status, dates).
//
// Version 1.7: the "By payment method" card was removed (kept minimal), and
// the Method filter is exactly All, PayMongo, GCash transfer, BPI transfer
// (src/lib/admin/earnings-filter.ts; Cash was removed).
//
// Version 1.6: VIEW ONLY. The "Needs review" and "Paid, needs action" tabs,
// the Needs action card and the Approve / Reject buttons are gone. Checking a
// GCash / BPI screenshot now happens in Appointments (the Pending chip, then
// the pencil on the booking). Each payment row links to its appointment.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks (admin_list_payments, admin_earnings).

import { Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader, StatCard } from "@/components/admin/AdminUi";
import { EarningsByWeek, type WeekEarnings } from "@/components/admin/EarningsChart";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EARNINGS_METHOD_OPTIONS, cleanEarningsMethod, earningsMethodFilter } from "@/lib/admin/earnings-filter";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { paymentMethodName } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { getAdminPayments, getBillingSummary, getEarnings } from "@/lib/data/admin-setup";
import { addDays, formatClassDate, formatManilaDateTime, formatPeso, formatTime, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBillingSummary, AdminEarningRow, AdminPayment, PaymentStatus } from "@/types/app";

export const metadata: Metadata = { title: "Earnings · Admin" };

// How many weeks the earnings bars show.
const WEEKS_SHOWN = 8;

// The status filter choices (the database refuses anything else). The
// method choices are EARNINGS_METHOD_OPTIONS (Version 1.7).
const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
];

// The filters as they are in the address.
type PaymentFilterValues = { q: string; method: string; status: string; from: string; to: string };

// The Earnings page.
// Takes: searchParams (the filters).
// Gives back: the heading, then the live part in <Suspense>.
export default function AdminEarningsPage({ searchParams }: PageProps<"/admin/earnings">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Earnings"
        intro="Money received from PayMongo, manual transfers and walk-ins. View only: payments are checked in Appointments."
      />
      <Suspense fallback={<AdminLoading label="the earnings" blocks={4} />}>
        <EarningsBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: numbers, bars and the payments table.
// Takes: the searchParams promise. Gives back: the cards and the list.
async function EarningsBody({ searchParams }: { searchParams: PageProps<"/admin/earnings">["searchParams"] }) {
  await requireAdmin();
  const values = readFilters(await searchParams);

  // The earnings range: from the Monday WEEKS_SHOWN - 1 weeks ago, to today
  const today = manilaDateString(nowForThisVisit());
  const thisMonday = mondayOf(today);
  const firstMonday = addDays(thisMonday, -7 * (WEEKS_SHOWN - 1));
  const monthStart = `${today.slice(0, 8)}01`;
  const earningsFrom = monthStart < firstMonday ? monthStart : firstMonday;

  let summary: AdminBillingSummary;
  let earnings: AdminEarningRow[];
  let list: { rows: AdminPayment[]; totalMatches: number };
  try {
    [summary, earnings, list] = await Promise.all([
      getBillingSummary(),
      getEarnings(earningsFrom, today),
      getAdminPayments({
        view: "all",
        search: values.q,
        // Version 1.7: the Method choice becomes a provider and / or method
        ...earningsMethodFilter(values.method),
        status: values.status,
        from: values.from,
        to: values.to,
      }),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the earnings" />;
  }

  const weeks = earningsByWeek(earnings, firstMonday, WEEKS_SHOWN);
  const monthName = new Date(`${monthStart}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {/* ---- Number cards (paid money only, Philippine time) ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Today"
          value={formatPeso(Number(summary.paid_today))}
          note={`${summary.payments_today} payment${summary.payments_today === 1 ? "" : "s"}`}
        />
        <StatCard label="This week" value={formatPeso(Number(summary.paid_this_week))} note="Paid since Monday" />
        <StatCard label="This month" value={formatPeso(Number(summary.paid_this_month))} note={monthName} />
        {/* The mat rental money is donated, so it's shown on its own */}
        <StatCard
          label="For the strays"
          value={formatPeso(Number(summary.mats_this_month))}
          note={`Mat rental this month · ${formatPeso(Number(summary.mats_all_time))} all time`}
        />
      </div>

      {/* ---- Earnings (Version 1.7: the weekly bars only, full width) ---- */}
      <EarningsByWeek weeks={weeks} note={`Last ${WEEKS_SHOWN} weeks, Monday to Sunday`} />

      {/* ---- The payments table, with filters ---- */}
      <PaymentFilters values={values} />

      <p role="status" className="text-xs text-muted">
        {list.totalMatches > list.rows.length
          ? `${list.totalMatches} payments · showing the newest ${list.rows.length}. Narrow the filters to see the rest.`
          : `${list.totalMatches} payment${list.totalMatches === 1 ? "" : "s"}`}
      </p>

      {list.rows.length === 0 ? (
        <AdminCard className="text-sm text-muted">No payments match these filters.</AdminCard>
      ) : (
        <PaymentList payments={list.rows} />
      )}
    </>
  );
}

// The search + filter form. A normal GET form, so the filters live in the
// address.
// Takes: the current filters. Gives back: the form.
function PaymentFilters({ values }: { values: PaymentFilterValues }) {
  return (
    <Form action="/admin/earnings" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
      <Input
        label="Search"
        name="q"
        type="search"
        defaultValue={values.q}
        placeholder="Client, email, reference or B69-…"
        maxLength={100}
        autoComplete="off"
        className="sm:col-span-2 lg:col-span-1"
      />
      {/* Version 1.7: exactly All, PayMongo, GCash transfer, BPI transfer */}
      <Select label="Method" name="method" defaultValue={values.method} options={[...EARNINGS_METHOD_OPTIONS]} />
      <Select label="Status" name="status" defaultValue={values.status} options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]} />
      <Input label="From" name="from" type="date" defaultValue={values.from} />
      <Input label="To" name="to" type="date" defaultValue={values.to} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" className="flex-1 lg:flex-none">
          <Search aria-hidden="true" className="size-4" />
          Search
        </Button>
        <Link
          href="/admin/earnings"
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg"
        >
          Clear
        </Link>
      </div>
    </Form>
  );
}

// The payments list: a table on laptops, cards on phones. Each row opens its
// appointment (view only here; changes are made in Appointments).
// Takes: the payments.
// Gives back: the table and the cards (one is shown at a time).
function PaymentList({ payments }: { payments: AdminPayment[] }) {
  return (
    <>
      {/* ===== Laptop: table ===== */}
      <AdminCard className="hidden overflow-x-auto p-0 lg:block lg:p-0">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">Payments</caption>
          <thead>
            <tr className="border-b border-admin-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold">Client</th>
              <th scope="col" className="px-4 py-3 font-semibold">Class</th>
              <th scope="col" className="px-4 py-3 font-semibold">Method</th>
              <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                <span className="sr-only">Appointment</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const badge = paymentBadge(payment);
              return (
                <tr
                  key={payment.payment_id}
                  className={cn(
                    "border-b border-admin-bg last:border-b-0",
                    payment.booking_status === "paid_needs_action" && "bg-error-bg/30",
                    payment.provider === "manual" && payment.status === "pending" && "bg-info-bg/40",
                  )}
                >
                  <td className="px-4 py-3">{formatManilaDateTime(payment.paid_at ?? payment.created_at)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {payment.is_walkin ? `Walk-in: ${payment.guest_name}` : payment.guest_name}
                  </td>
                  <td className="px-4 py-3">{classLine(payment)}</td>
                  <td className="px-4 py-3">{paymentMethodName(payment.method, payment.provider)}</td>
                  <td className="px-4 py-3 font-semibold">{formatPeso(Number(payment.amount))}</td>
                  <td className="px-4 py-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{referenceLine(payment)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/appointments/${payment.booking_id}`}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-brown hover:bg-admin-bg"
                    >
                      View appointment
                      <span className="sr-only"> for {payment.guest_name}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminCard>

      {/* ===== Phone: cards ===== */}
      <ul className="flex flex-col gap-2.5 lg:hidden">
        {payments.map((payment) => {
          const badge = paymentBadge(payment);
          return (
            <li key={payment.payment_id}>
              <Link
                href={`/admin/appointments/${payment.booking_id}`}
                className="flex flex-col gap-1.5 rounded-2xl border border-admin-line bg-white p-3.5 focus-visible:outline-2 focus-visible:outline-brown active:bg-admin-bg"
              >
                <span className="flex items-start justify-between gap-2.5">
                  <span className="min-w-0 break-words text-sm font-semibold text-ink">
                    {payment.is_walkin ? `Walk-in: ${payment.guest_name}` : payment.guest_name}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </span>
                <span className="text-xs text-muted">
                  {formatManilaDateTime(payment.paid_at ?? payment.created_at)} · {classLine(payment)}
                </span>
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted">{referenceLine(payment)}</span>
                  <span className="shrink-0 font-semibold text-ink">
                    {formatPeso(Number(payment.amount))} · {paymentMethodName(payment.method, payment.provider)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// The class a payment is for, e.g. "Sat, Oct 25 · 9:00 AM + mat".
// Takes: the payment. Gives back: the text.
function classLine(payment: AdminPayment): string {
  return `${formatClassDate(payment.class_date).short} · ${formatTime(payment.start_time)}${payment.mat_rental ? " + mat" : ""}`;
}

// The reference column: the PayMongo reference, "Screenshot", or who
// recorded a cash / walk-in payment.
// Takes: the payment. Gives back: the text.
function referenceLine(payment: AdminPayment): string {
  if (payment.paymongo_ref) return payment.paymongo_ref;
  if (payment.provider === "manual") {
    if (payment.verified_by_name) return `Checked by ${payment.verified_by_name}`;
    return payment.screenshot_path ? "Screenshot" : "No screenshot";
  }
  if (payment.verified_by_name) return `Recorded by ${payment.verified_by_name}`;
  return "—";
}

// The badge for one payment. A paid payment whose booking is "paid, needs
// action" shows that (red), like the mockup.
// Takes: the payment. Gives back: the badge text and color.
function paymentBadge(payment: AdminPayment): { label: string; variant: BadgeVariant } {
  if (payment.status === "paid" && payment.booking_status === "paid_needs_action") {
    return { label: "Paid, needs action", variant: "error" };
  }
  const badges: Record<PaymentStatus, { label: string; variant: BadgeVariant }> = {
    paid: { label: "Paid", variant: "success" },
    pending:
      payment.provider === "manual"
        ? { label: "Awaiting verification", variant: "info" }
        : { label: "Checkout open", variant: "warning" },
    failed: { label: "Failed", variant: "error" },
    expired: { label: "Expired", variant: "neutral" },
    rejected: { label: "Rejected", variant: "error" },
    refunded: { label: "Refunded", variant: "neutral" },
  };
  return badges[payment.status];
}

// Reads the filters from the address, ignoring anything not valid.
// Takes: the page's searchParams. Gives back: clean values.
function readFilters(params: Record<string, string | string[] | undefined>): PaymentFilterValues {
  const method = firstParam(params.method) ?? "";
  const status = firstParam(params.status) ?? "";
  const from = firstParam(params.from) ?? "";
  const to = firstParam(params.to) ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return {
    q: (firstParam(params.q) ?? "").trim().slice(0, 100),
    // Version 1.7: only the 4 choices (an old link with ?method=cash = All)
    method: cleanEarningsMethod(method),
    status: STATUS_OPTIONS.some((option) => option.value === status) ? status : "",
    from: isDate(from) ? from : "",
    to: isDate(to) ? to : "",
  };
}

// The Monday of the week a date is in (weeks run Monday to Sunday).
// Takes: "YYYY-MM-DD". Gives back: that week's Monday, "YYYY-MM-DD".
function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

// Adds up the earnings rows into one bar per week.
// Takes: the rows (by day + method), the first Monday and how many weeks.
// Gives back: the weeks, oldest first (weeks with no money show ₱0).
function earningsByWeek(rows: AdminEarningRow[], firstMonday: string, count: number): WeekEarnings[] {
  return Array.from({ length: count }, (_, n) => {
    const start = addDays(firstMonday, 7 * n);
    const end = addDays(start, 6);
    const inWeek = rows.filter((row) => row.day >= start && row.day <= end);
    const amount = inWeek.reduce((sum, row) => sum + Number(row.amount), 0);
    const mats = inWeek.reduce((sum, row) => sum + Number(row.mat_amount), 0);
    const startDate = formatClassDate(start);
    const endDate = formatClassDate(end);
    return {
      // "Oct 20–26", or "Oct 27–Nov 2" when the week crosses into a new month
      label:
        startDate.month === endDate.month
          ? `${startDate.month} ${startDate.day}–${endDate.day}`
          : `${startDate.month} ${startDate.day}–${endDate.month} ${endDate.day}`,
      classFees: amount - mats,
      mats,
      payments: inWeek.reduce((sum, row) => sum + row.payments, 0),
    };
  });
}

