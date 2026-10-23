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

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireClient } from "@/lib/auth/user";
import { paymentMethodName, paymentStatusBadge } from "@/lib/booking-rules";
import { getMyPayments } from "@/lib/data/account";
import { formatClassDate, formatManilaDate, formatPeso, formatTime } from "@/lib/format";
import type { MyPayment } from "@/types/app";

export const metadata = { title: "Payments" };

// The Payments page.
// Takes: nothing.
// Gives back: the heading, then the live part inside <Suspense>.
export default function PaymentsPage() {
  return (
    <>
      <AccountHeading
        title="Payments"
        intro="Every payment you made, with receipts. You pay per class; nothing is charged automatically."
      />
      <Suspense fallback={<AccountLoading label="your payments" />}>
        <PaymentsList />
      </Suspense>
    </>
  );
}

// The live part: the totals and the list.
// Takes: nothing.
// Gives back: the three totals and the payments, or a "no payments yet" card.
async function PaymentsList() {
  await requireClient("/account/payments");

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

  return (
    <div className="flex flex-col gap-5">
      {/* The three totals: one column on small phones, three side by side after */}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Total label="Total paid" value={formatPeso(totalPaid)} />
        <Total label="Classes paid" value={String(paid.length)} />
        <Total label="Donated through mat rental" value={formatPeso(donated)} />
      </dl>

      {payments.length === 0 ? (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">No payments yet. When you pay for a class, it shows here.</p>
          <ButtonLink href="/book">Book a class</ButtonLink>
        </Card>
      ) : (
        <>
          {/* Laptop / tablet: a table (docs/designs/Payments.html) */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Your payments, newest first</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-brown">
                  <th scope="col" className="rounded-l-xl bg-tan-soft px-4 py-3 font-bold">Date</th>
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
                {payments.map((payment) => {
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
            {payments.map((payment) => {
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
                      {paymentMethodName(payment.method, payment.provider)} · {paymentDate(payment)}
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
