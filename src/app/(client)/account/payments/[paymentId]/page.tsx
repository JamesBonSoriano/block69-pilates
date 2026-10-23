// A payment receipt: /account/payments/<payment id>
// Where it's used: the "Receipt" link on the Payments page.
// It's made to be printed or saved as a PDF: the header, footer and account
// menu are left out of the printout (print:hidden), and so is the Print button.
//
// ONLY THE PAYMENT'S OWNER: requireClient() checks the login, and
// get_my_payments(id) (migration 8) gives nothing back for someone else's
// payment, so they get "page not found".
// Money: the amounts are the ones SAVED on the booking and payment
// (book_seat() worked them out from settings). Nothing is recalculated here.
// No card or bank numbers are ever stored, so none can show here.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { PrintButton } from "@/components/account/PrintButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireClient } from "@/lib/auth/user";
import { bookingReference, paymentMethodName, paymentStatusBadge, receiptNumber } from "@/lib/booking-rules";
import { getMyPayment } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatManilaDate, formatManilaDateTime, formatPeso, formatTimeRange } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import type { MyPayment } from "@/types/app";

export const metadata = { title: "Receipt" };

// The receipt page.
// Takes: params (the payment id from the address).
// Gives back: a back link, then the receipt inside <Suspense>.
export default function ReceiptPage({ params }: PageProps<"/account/payments/[paymentId]">) {
  return (
    <>
      <Link
        href="/account/payments"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-brown print:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Payments
      </Link>
      <Suspense fallback={<AccountLoading label="your receipt" cards={1} />}>
        <Receipt params={params} />
      </Suspense>
    </>
  );
}

// Loads the payment and draws the receipt.
// Takes: the params promise.
// Gives back: the receipt card and the Print button.
async function Receipt({ params }: { params: PageProps<"/account/payments/[paymentId]">["params"] }) {
  const { paymentId } = await params;
  if (!isUuid(paymentId)) notFound();
  const user = await requireClient(`/account/payments/${paymentId}`);

  let payment: MyPayment | null;
  let settings;
  try {
    [payment, settings] = await Promise.all([getMyPayment(paymentId), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your receipt" />;
  }
  if (!payment) notFound();

  const badge = paymentStatusBadge(payment.status, payment.provider);
  const date = formatClassDate(payment.class_date);
  const classFee = Number(payment.class_fee);
  const matFee = Number(payment.mat_fee);
  const discount = Number(payment.discount);

  return (
    <div className="flex flex-col gap-4">
      {/* print:border-0 = no box around it on paper */}
      <Card className="flex flex-col gap-6 print:border-0 print:p-0">
        {/* Cafe name and address on the left, receipt number on the right */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-heading text-2xl font-semibold text-brown">{settings.cafeName}</p>
            {settings.cafeAddress && <p className="text-sm text-muted">{settings.cafeAddress}</p>}
            {settings.cafeEmail && <p className="text-sm text-muted">{settings.cafeEmail}</p>}
          </div>
          <div className="sm:text-right">
            <h1 className="font-heading text-xl font-semibold text-brown">Payment receipt</h1>
            <p className="text-sm text-muted">{receiptNumber(payment.payment_id)}</p>
            <div className="mt-1">
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </div>
        </div>

        {/* Who, when, how */}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Paid by">
            {user.fullName || user.email}
            <span className="block break-all text-muted">{user.email}</span>
          </Detail>
          <Detail label="Date paid">
            {payment.paid_at ? formatManilaDateTime(payment.paid_at) : `Not paid (started ${formatManilaDate(payment.created_at)})`}
          </Detail>
          <Detail label="Method">{paymentMethodName(payment.method, payment.provider)}</Detail>
          {payment.paymongo_ref && (
            <Detail label="PayMongo reference">
              <span className="break-all">{payment.paymongo_ref}</span>
            </Detail>
          )}
          <Detail label="Booking">{bookingReference(payment.booking_id)}</Detail>
          <Detail label="Class">
            Mindful Mat Pilates, {date.full} · {formatTimeRange(payment.start_time, payment.end_time)}
            {payment.now_date && payment.now_start_time && payment.now_end_time && (
              <span className="block text-muted">
                Moved to {formatClassDate(payment.now_date).full} ·{" "}
                {formatTimeRange(payment.now_start_time, payment.now_end_time)}
              </span>
            )}
          </Detail>
        </dl>

        {/* The money, line by line */}
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">What was paid for</caption>
          <tbody>
            <tr className="border-b border-line">
              <th scope="row" className="py-2.5 text-left font-normal">
                Class fee{payment.drink_choice ? ` (includes ${payment.drink_choice})` : " (includes your drink)"}
              </th>
              <td className="py-2.5 text-right">{formatPeso(classFee)}</td>
            </tr>
            {payment.mat_rental && (
              <tr className="border-b border-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  Mat rental (donated to feed stray animals)
                </th>
                <td className="py-2.5 text-right">{formatPeso(matFee)}</td>
              </tr>
            )}
            {discount > 0 && (
              <tr className="border-b border-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  Voucher{payment.voucher_code ? ` ${payment.voucher_code}` : ""} (class fee only)
                </th>
                <td className="py-2.5 text-right">−{formatPeso(discount)}</td>
              </tr>
            )}
            <tr>
              <th scope="row" className="pt-3 text-left font-heading text-base font-semibold text-brown">
                {payment.status === "paid" ? "Amount paid" : "Amount"}
              </th>
              <td className="pt-3 text-right font-heading text-base font-semibold text-brown">
                {formatPeso(Number(payment.amount))}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="text-xs leading-relaxed text-muted">
          Thank you for booking with {settings.cafeName}. This receipt shows a payment for one class. Card and bank
          details are never stored by the cafe.
        </p>
      </Card>

      <div className="flex">
        <PrintButton />
      </div>
    </div>
  );
}

// One labelled detail on the receipt.
// Takes: the label and the value.
// Gives back: a <div> with a <dt> and <dd> (inside the receipt's <dl>).
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      {/* Same look as <Overline> (small bold capitals) */}
      <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brown">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
