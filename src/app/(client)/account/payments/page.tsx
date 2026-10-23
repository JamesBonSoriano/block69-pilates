// Payments: /account/payments
// Where it's used: the account menu.
// Layout follows docs/designs/Payments.html: three totals at the top, then
// every payment (a table on laptops, cards on phones), with a Receipt link
// for paid ones.
//
// ONLY THE PERSON'S OWN PAYMENTS: get_my_payments() (migration 8) only
// gives back payments for the caller's own bookings, even for admins.
// After a transfer the payment stays on the ORIGINAL booking; it's listed
// once, with "moved to <new class>".
// PayMongo pages that were opened but never paid (pending / expired /
// failed) are NOT listed: no money moved, so they aren't payments the
// client made. Manual transfers being checked ARE listed.
// LIVE DATA: loaded on every visit, never cached.
//
// Change 17, Part G: the "Date" column is "Payment Date", and a FILTER
// button opens status, payment method and month / date range filters
// (src/lib/payment-filters.ts). The filters are in the address (a GET
// form), so they work without JavaScript. The three totals always count ALL
// payments.

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { firstParam } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import { paymentMethodName, paymentStatusBadge } from "@/lib/booking-rules";
import { getMyPayments } from "@/lib/data/account";
import { formatClassDate, formatManilaDate, formatPeso, formatTime, manilaDateString } from "@/lib/format";
import {
  METHOD_FILTERS,
  STATUS_FILTERS,
  WHEN_FILTERS,
  activeFilterCount,
  filterPayments,
  readPaymentFilters,
  type PaymentFilters,
} from "@/lib/payment-filters";
import { nowForThisVisit } from "@/lib/server-clock";
import type { MyPayment } from "@/types/app";

export const metadata = { title: "Payments" };

// The Payments page.
// Takes: searchParams (the filters, see src/lib/payment-filters.ts).
// Gives back: the heading, then the live part inside <Suspense>.
export default function PaymentsPage({ searchParams }: PageProps<"/account/payments">) {
  return (
    <>
      <AccountHeading
        title="Payments"
        intro="Every payment you made, with receipts. You pay per class; nothing is charged automatically."
      />
      <Suspense fallback={<AccountLoading label="your payments" />}>
        <PaymentsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part: the totals, the Filter and the list.
// Takes: the searchParams promise.
// Gives back: the three totals and the (filtered) payments, or a "no
// payments yet" card.
async function PaymentsList({ searchParams }: Pick<PageProps<"/account/payments">, "searchParams">) {
  await requireClient("/account/payments");
  const params = await searchParams;
  const filters = readPaymentFilters({
    status: firstParam(params.status),
    method: firstParam(params.method),
    when: firstParam(params.when),
    from: firstParam(params.from),
    to: firstParam(params.to),
  });
  // Today in the Philippines (for "this month" etc.). requireClient() has
  // waited for a real visit, so reading the clock here is fine.
  const today = manilaDateString(nowForThisVisit());

  let payments: MyPayment[];
  try {
    // Leave out PayMongo pages that were never paid (see the top of this file)
    payments = (await getMyPayments()).filter(
      (payment) => payment.provider !== "paymongo" || payment.status === "paid" || payment.status === "refunded",
    );
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your payments" />;
  }

  // Totals count PAID payments only (not failed, expired or refunded ones)
  const paid = payments.filter((payment) => payment.status === "paid");
  const totalPaid = paid.reduce((sum, payment) => sum + Number(payment.amount), 0);
  // Every mat rental peso goes to the strays (CLAUDE.md section 3)
  const donated = paid.reduce((sum, payment) => sum + Number(payment.mat_fee), 0);

  // The list after the filters (the totals above always count everything)
  const shown = filterPayments(payments, filters, today);
  const filterCount = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-5">
      {/* The three totals: one column on small phones, three side by side after */}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Total label="Total paid" value={formatPeso(totalPaid)} />
        <Total label="Classes paid" value={String(paid.length)} />
        <Total label="Donated through mat rental" value={formatPeso(donated)} />
      </dl>

      {payments.length > 0 && (
        <div className="flex flex-col gap-2">
          <FilterPanel filters={filters} count={filterCount} />
          <p className="text-sm text-muted" aria-live="polite">
            {filterCount > 0
              ? `Showing ${shown.length} of ${payments.length} payment${payments.length === 1 ? "" : "s"}.`
              : `${payments.length} payment${payments.length === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>
      )}

      {payments.length === 0 ? (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">No payments yet. When you pay for a class, it shows here.</p>
          <ButtonLink href="/book">Book a class</ButtonLink>
        </Card>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">No payments match these filters.</p>
          <ButtonLink href="/account/payments" variant="secondary">
            Clear filters
          </ButtonLink>
        </Card>
      ) : (
        <>
          {/* Laptop / tablet: a table (docs/designs/Payments.html) */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Your payments, newest first</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-brown">
                  <th scope="col" className="rounded-l-xl bg-tan-soft px-4 py-3 font-bold">Payment Date</th>
                  <th scope="col" className="bg-tan-soft px-4 py-3 font-bold">Class</th>
                  <th scope="col" className="bg-tan-soft px-4 py-3 font-bold">Method</th>
                  <th scope="col" className="bg-tan-soft px-4 py-3 text-right font-bold">Amount</th>
                  <th scope="col" className="bg-tan-soft px-4 py-3 font-bold">Status</th>
                  <th scope="col" className="rounded-r-xl bg-tan-soft px-4 py-3">
                    <span className="sr-only">Receipt</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((payment) => {
                  const badge = paymentStatusBadge(payment.status, payment.provider);
                  return (
                    <tr key={payment.payment_id} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-4">{paymentDate(payment)}</td>
                      <td className="px-4 py-4">
                        <ClassText payment={payment} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">{paymentMethodName(payment.method, payment.provider)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold">
                        {formatPeso(Number(payment.amount))}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <ReceiptLink payment={payment} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Phone: one card per payment (no sideways scrolling) */}
          <ul className="flex flex-col gap-3 md:hidden">
            {shown.map((payment) => {
              const badge = paymentStatusBadge(payment.status, payment.provider);
              return (
                <li key={payment.payment_id}>
                  <Card className="flex flex-col gap-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-heading text-lg font-semibold text-brown">
                        {formatPeso(Number(payment.amount))}
                      </p>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <ClassText payment={payment} />
                    <p className="text-muted">
                      {paymentMethodName(payment.method, payment.provider)} · Payment date: {paymentDate(payment)}
                    </p>
                    <ReceiptLink payment={payment} />
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// The "Filter" button and its panel.
// Takes: the filters now in use and how many are on.
// Gives back: a <details> (opens and closes without JavaScript) whose summary
// looks like a button ("Filter (2)"), with a GET form: status, payment
// method, when (and the two dates for "Pick dates"), Apply and Clear.
function FilterPanel({ filters, count }: { filters: PaymentFilters; count: number }) {
  return (
    <details className="group rounded-[20px] border border-line bg-card" open={count > 0 ? true : undefined}>
      <summary
        className={
          // list-none + the webkit rule hide the browser's own triangle
          "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[20px] px-4 py-2.5 text-sm font-semibold text-brown " +
          "[&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        }
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filter
        {count > 0 && (
          <span className="rounded-full bg-primary px-2 text-xs text-on-primary">
            {count}
            <span className="sr-only"> on</span>
          </span>
        )}
      </summary>
      {/* A normal GET form: the filters go into the address */}
      <form method="get" action="/account/payments" className="flex flex-col gap-4 border-t border-line p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Status" name="status" options={[...STATUS_FILTERS]} defaultValue={filters.status} required />
          <Select label="Payment method" name="method" options={[...METHOD_FILTERS]} defaultValue={filters.method} required />
          <Select label="When" name="when" options={[...WHEN_FILTERS]} defaultValue={filters.when} required />
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs text-muted">For &quot;Pick dates&quot; (payment date, from and to)</legend>
          <Input label="From" name="from" type="date" defaultValue={filters.from ?? ""} />
          <Input label="To" name="to" type="date" defaultValue={filters.to ?? ""} />
        </fieldset>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit">Apply filters</Button>
          {count > 0 && (
            <ButtonLink href="/account/payments" variant="secondary">
              Clear filters
            </ButtonLink>
          )}
        </div>
      </form>
    </details>
  );
}

// One of the three totals at the top.
// Takes: its label and the value (already formatted).
// Gives back: a small card (a <dt> + <dd> pair inside the <dl>).
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-card px-5 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-heading text-2xl font-semibold text-brown">{value}</dd>
    </div>
  );
}

// The date shown for a payment: when it was paid, or when it was started.
// Takes: the payment. Gives back: e.g. "22 October 2026".
function paymentDate(payment: MyPayment): string {
  return formatManilaDate(payment.paid_at ?? payment.created_at);
}

// Which class a payment was for, e.g. "Thu, Oct 29 · 9:00 AM + mat",
// plus "Moved to Sat, Nov 1 · 10:15 AM" after a transfer.
// Takes: the payment. Gives back: the text.
function ClassText({ payment }: { payment: MyPayment }) {
  return (
    <span className="flex flex-col">
      <span>
        {formatClassDate(payment.class_date).short} · {formatTime(payment.start_time)}
        {payment.mat_rental && " + mat"}
      </span>
      {payment.now_date && payment.now_start_time && (
        <span className="text-xs text-muted">
          Moved to {formatClassDate(payment.now_date).short} · {formatTime(payment.now_start_time)}
        </span>
      )}
    </span>
  );
}

// The "Receipt" link (paid payments only).
// Takes: the payment. Gives back: the link, or nothing.
function ReceiptLink({ payment }: { payment: MyPayment }) {
  if (payment.status !== "paid") return null;
  return (
    <Link
      href={`/account/payments/${payment.payment_id}`}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-brown underline underline-offset-2"
    >
      Receipt
      <span className="sr-only"> for the payment on {paymentDate(payment)}</span>
    </Link>
  );
}
