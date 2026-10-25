// Admin Payments ("Manage Billings"): /admin/payments
// Where it's used: the admin menu ("Payments"), and the Dashboard's
// "Needs action" list (screenshots to check, late payments).
// Layout follows docs/designs/AdminPayments.html: number cards (Step 12:
// today, this week, this month, the mat rental donations and needs action,
// all from admin_billing_summary), earnings by week + by payment method,
// then the payments list with filters.
//
// Three tabs (in the address: ?view=all / review / late):
//   all     every payment, with filters (search, method, status, dates)
//   review  manual GCash / BPI transfers waiting for a check: the uploaded
//           screenshot (a 10-minute private link; only admins can open the
//           private bucket) with Approve / Reject -> admin_review_manual_payment
//   late    "Paid, needs action": the money arrived but the seat couldn't be
//           confirmed (late and the class full, class cancelled / closed /
//           started, or the wrong amount). A box explains what to do, and
//           each row links to its booking, where the admin can move it to
//           another class or cancel it
// Clients upload the screenshot on the pay page (Step 12, ManualTransfer.tsx)
// into their own folder of the private bucket.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks (admin_list_payments, admin_earnings).

import { ExternalLink, Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader, StatCard } from "@/components/admin/AdminUi";
import { ConfirmActionButton } from "@/components/admin/ConfirmActionButton";
import { EarningsByMethod, EarningsByWeek, type MethodEarnings, type WeekEarnings } from "@/components/admin/EarningsChart";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { reviewPayment } from "@/lib/admin/setup-actions";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { adminBookingStatusBadge, bookingReference, paymentMethodName } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { getAdminPayments, getBillingSummary, getEarnings, getScreenshotLinks } from "@/lib/data/admin-setup";
import { addDays, formatClassDate, formatManilaDateTime, formatPeso, formatTime, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBillingSummary, AdminEarningRow, AdminPayment, PaymentStatus } from "@/types/app";

export const metadata: Metadata = { title: "Payments · Admin" };

// How many weeks the earnings bars show.
const WEEKS_SHOWN = 8;

// The tabs.
const VIEWS = [
  { key: "all", label: "All payments" },
  { key: "review", label: "Needs review" },
  { key: "late", label: "Paid, needs action" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// The filter choices (the database refuses anything else).
const METHOD_OPTIONS = [
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
  { value: "bpi", label: "BPI transfer" },
  { value: "cash", label: "Cash" },
];
const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
];

// The filters as they are in the address.
type PaymentFilterValues = { view: ViewKey; q: string; method: string; status: string; from: string; to: string };

// The Payments page.
// Takes: searchParams (the tab and filters).
// Gives back: the heading, then the live part in <Suspense>.
export default function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Payments"
        intro="Payments from PayMongo, manual transfers and walk-ins, plus earnings."
      />
      <Suspense fallback={<AdminLoading label="the payments" blocks={4} />}>
        <PaymentsBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: numbers, bars, tabs and the list.
// Takes: the searchParams promise. Gives back: the cards and the list.
async function PaymentsBody({ searchParams }: { searchParams: PageProps<"/admin/payments">["searchParams"] }) {
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
        view: values.view,
        search: values.q,
        method: values.method,
        status: values.status,
        from: values.from,
        to: values.to,
      }),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the payments" />;
  }

  const weeks = earningsByWeek(earnings, firstMonday, WEEKS_SHOWN);
  const methods = earningsByMethod(earnings.filter((row) => row.day >= monthStart));
  const monthName = new Date(`${monthStart}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });
  const needsAction = summary.awaiting_verification + summary.paid_needs_action;

  // Private links to the screenshots shown on the Needs review tab
  const screenshots =
    values.view === "review"
      ? await getScreenshotLinks(list.rows.flatMap((row) => (row.screenshot_path ? [row.screenshot_path] : [])))
      : {};

  return (
    <>
      {/* ---- Number cards (paid money only, Philippine time) ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
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
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            label="Needs action"
            value={String(needsAction)}
            tone={needsAction > 0 ? "alert" : "normal"}
            note={`${summary.awaiting_verification} to verify · ${summary.paid_needs_action} paid, not confirmed`}
          />
        </div>
      </div>

      {/* ---- Earnings ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <EarningsByWeek weeks={weeks} note={`Last ${WEEKS_SHOWN} weeks, Monday to Sunday`} />
        <EarningsByMethod methods={methods} note={monthName} />
      </div>

      {/* ---- Tabs ---- */}
      <nav aria-label="Payment lists">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {VIEWS.map((view) => {
            const count =
              view.key === "review" ? summary.awaiting_verification : view.key === "late" ? summary.paid_needs_action : null;
            const active = view.key === values.view;
            return (
              <li key={view.key} className="shrink-0">
                <Link
                  href={view.key === "all" ? "/admin/payments" : `/admin/payments?view=${view.key}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                    active
                      ? "border-brown bg-brown font-semibold text-card"
                      : "border-admin-active bg-white text-brown hover:bg-admin-bg",
                  )}
                >
                  {view.label}
                  {count !== null && count > 0 && (
                    <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-white text-brown" : "bg-error-bg text-error")}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {values.view === "all" && <PaymentFilters values={values} />}
      {values.view === "late" && <LatePaymentHelp />}

      <p role="status" className="text-xs text-muted">
        {list.totalMatches > list.rows.length
          ? `${list.totalMatches} payments · showing the newest ${list.rows.length}. Narrow the filters to see the rest.`
          : `${list.totalMatches} payment${list.totalMatches === 1 ? "" : "s"}`}
      </p>

      {/* ---- The list for this tab ---- */}
      {list.rows.length === 0 ? (
        <AdminCard className="text-sm text-muted">
          {values.view === "review"
            ? "No transfers waiting for a check."
            : values.view === "late"
              ? "No late payments. Nothing to sort out."
              : "No payments match these filters."}
        </AdminCard>
      ) : values.view === "review" ? (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.rows.map((payment) => (
            <ReviewCard
              key={payment.payment_id}
              payment={payment}
              screenshotUrl={payment.screenshot_path ? screenshots[payment.screenshot_path] : undefined}
            />
          ))}
        </ul>
      ) : (
        <PaymentList payments={list.rows} late={values.view === "late"} />
      )}
    </>
  );
}

// What to do with a "Paid, needs action" booking (the Late tab).
// Takes: nothing. Gives back: a short how-to card.
function LatePaymentHelp() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-warning/30 bg-warning-bg p-4 text-sm leading-relaxed lg:p-6">
      <p className="font-semibold text-ink">What to do with these</p>
      <p className="text-muted">
        The client paid, but the seat couldn&apos;t be confirmed: the payment came after the seat hold ended and the
        class had filled up, the class was cancelled, closed or had already started, or the amount was different
        from the booking total. Their money is recorded as paid.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-ink">
        <li>
          <span className="font-semibold">Usually nothing:</span> the client can move to any open class for free
          from My Bookings (&quot;Move to another class&quot;), as long as the payment covers the total. Remind them
          if they haven&apos;t.
        </li>
        <li>
          <span className="font-semibold">Or refund them:</span> refund the money outside the website (PayMongo
          dashboard → the payment → Refund, or by GCash / cash), then cancel the booking with no credit and write
          &quot;refunded&quot; as the reason.
        </li>
        <li>Message the client either way (emails come later).</li>
      </ol>
    </div>
  );
}

// The search + filter form (All payments tab). A normal GET form, so the
// filters live in the address.
// Takes: the current filters. Gives back: the form.
function PaymentFilters({ values }: { values: PaymentFilterValues }) {
  return (
    <Form action="/admin/payments" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
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
      <Select label="Method" name="method" defaultValue={values.method} options={[{ value: "", label: "All methods" }, ...METHOD_OPTIONS]} />
      <Select label="Status" name="status" defaultValue={values.status} options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]} />
      <Input label="From" name="from" type="date" defaultValue={values.from} />
      <Input label="To" name="to" type="date" defaultValue={values.to} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" className="flex-1 lg:flex-none">
          <Search aria-hidden="true" className="size-4" />
          Search
        </Button>
        <Link
          href="/admin/payments"
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brown underline underline-offset-2 hover:bg-admin-bg"
        >
          Clear
        </Link>
      </div>
    </Form>
  );
}

// The payments list (All payments and Paid needs action tabs):
// a table on laptops, cards on phones.
// Takes: the payments, and late = true on the "Paid, needs action" tab
// (then each row offers "Move or cancel").
// Gives back: the table and the cards (one is shown at a time).
function PaymentList({ payments, late }: { payments: AdminPayment[]; late: boolean }) {
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
                <span className="sr-only">Actions</span>
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
                      href={`/admin/bookings/${payment.booking_id}`}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-brown hover:bg-admin-bg"
                    >
                      {late ? "Move or cancel" : "View booking"}
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
                href={`/admin/bookings/${payment.booking_id}`}
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
                {late && <span className="text-xs font-semibold text-brown">Move or cancel this booking →</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// One manual transfer to check: who, which class, how much, the screenshot,
// and the Approve / Reject buttons.
// Takes: the payment and the private link to its screenshot (if it exists).
// Gives back: an <li> card.
function ReviewCard({ payment, screenshotUrl }: { payment: AdminPayment; screenshotUrl?: string }) {
  const status = adminBookingStatusBadge(payment.booking_status);
  return (
    <li>
      <AdminCard className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{payment.guest_name}</p>
            <p className="text-xs text-muted">
              {bookingReference(payment.booking_id)} · {classLine(payment)}
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-sm">
          <span className="font-heading text-lg font-semibold text-brown">{formatPeso(Number(payment.amount))}</span> by{" "}
          {paymentMethodName(payment.method, payment.provider)} · sent {formatManilaDateTime(payment.created_at)}
        </p>
        <p className="text-xs text-muted">
          Check that this amount arrived in the cafe&apos;s {payment.method === "bpi" ? "BPI account" : "GCash"} before
          approving. The seat stays held until you decide.
        </p>

        {/* The screenshot (a private 10-minute link) */}
        {screenshotUrl ? (
          <a
            href={screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-xl border border-admin-line bg-admin-bg"
          >
            {/* A plain <img>: next/image only loads the PUBLIC site-images
                bucket, and this link is private and only works for 10 minutes */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt={`Payment screenshot from ${payment.guest_name}`}
              className="max-h-80 w-full object-contain"
            />
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-brown">
              <ExternalLink aria-hidden="true" className="size-3" /> Open full size
            </span>
          </a>
        ) : (
          <p className="rounded-xl bg-warning-bg px-3.5 py-3 text-xs text-warning">
            {payment.screenshot_path
              ? "The screenshot file couldn't be found. Ask the client to send it by message."
              : "No screenshot was uploaded with this payment."}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          <ConfirmActionButton
            action={reviewPayment}
            fields={{ payment_id: payment.payment_id, decision: "approve" }}
            label="Approve"
            srLabel={` ${payment.guest_name}'s payment`}
            variant="primary"
            confirm={{
              title: "Approve this payment?",
              body: `${formatPeso(Number(payment.amount))} from ${payment.guest_name}. Their booking becomes confirmed.`,
              confirmLabel: "Yes, approve",
            }}
          />
          <ConfirmActionButton
            action={reviewPayment}
            fields={{ payment_id: payment.payment_id, decision: "reject" }}
            label="Reject"
            srLabel={` ${payment.guest_name}'s payment`}
            variant="danger"
            confirm={{
              title: "Reject this payment?",
              body: "The booking ends and the seat is freed for someone else. Please message the client to say why (emails come later).",
              confirmLabel: "Yes, reject",
            }}
          />
          <ButtonLink href={`/admin/bookings/${payment.booking_id}`} variant="secondary">
            See the booking
          </ButtonLink>
        </div>
      </AdminCard>
    </li>
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

// Reads the tab and filters from the address, ignoring anything not valid.
// Takes: the page's searchParams. Gives back: clean values.
function readFilters(params: Record<string, string | string[] | undefined>): PaymentFilterValues {
  const view = firstParam(params.view);
  const method = firstParam(params.method) ?? "";
  const status = firstParam(params.status) ?? "";
  const from = firstParam(params.from) ?? "";
  const to = firstParam(params.to) ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return {
    view: VIEWS.some((item) => item.key === view) ? (view as ViewKey) : "all",
    q: (firstParam(params.q) ?? "").trim().slice(0, 100),
    method: METHOD_OPTIONS.some((option) => option.value === method) ? method : "",
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

// Adds up the earnings rows by payment method (the mockup puts BPI and cash
// together; a GCash transfer counts as GCash).
// Takes: the rows. Gives back: the methods with money, biggest first.
function earningsByMethod(rows: AdminEarningRow[]): MethodEarnings[] {
  const names: Record<string, string> = { gcash: "GCash", maya: "Maya", card: "Card", bpi: "BPI transfer / cash", cash: "BPI transfer / cash" };
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = names[row.method] ?? row.method;
    totals.set(label, (totals.get(label) ?? 0) + Number(row.amount));
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}
