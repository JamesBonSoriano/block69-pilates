// A printable receipt for one booking: /admin/receipt/<booking id>
// Where it's used: the "Print receipt" button on the admin booking details
// page (src/app/admin/(panel)/bookings/[bookingId]/page.tsx), Version 1.4.
//
// It's a page made ONLY for printing (not a print of the admin screen): it
// sits outside the admin frame (src/app/admin/(panel)/), so there's no side
// menu or tab bar, just a receipt sheet. On screen it shows a Back link and a
// Print button above the sheet; both are left out of the printout
// (print:hidden), and the sheet loses its box on paper.
//
// What the receipt shows: the cafe's name, address and email (Settings), the
// receipt and booking numbers, the client, the class, the items and amounts
// SAVED on the booking (nothing is recalculated), every PAID payment with its
// method, PayMongo reference and date, and the date it was printed.
// No card or bank numbers are ever stored, so none can show here.
//
// Protection: src/proxy.ts sends guests to /admin/login and clients away
// (this is an /admin page), requireAdmin() checks AGAIN, and the database's
// admin_get_booking() refuses anyone who isn't an active admin.

import { ArrowLeft } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PrintButton } from "@/components/account/PrintButton";
import { AdminLoadError, AdminLoading } from "@/components/admin/AdminUi";
import { requireAdmin } from "@/lib/auth/user";
import { bookingReference, paymentMethodName, receiptNumber } from "@/lib/booking-rules";
import { getAdminBooking } from "@/lib/data/admin";
import { getPublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatManilaDateTime, formatPeso, formatTimeRange } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBookingDetails } from "@/types/app";

// Tab title (also the file name when "Save as PDF" is picked). Private page.
export const metadata: Metadata = { title: "Receipt · Admin", robots: { index: false } };

// The phone's own top bar stays admin brown here, like the admin frame.
export const viewport: Viewport = { themeColor: "#43271B" };

// The receipt page.
// Takes: params (the booking id from the address).
// Gives back: the admin-colored page with the receipt inside <Suspense>
// (it reads the login and live data).
export default function AdminReceiptPage({ params }: PageProps<"/admin/receipt/[bookingId]">) {
  return (
    // data-theme="admin" keeps the brown admin colors (see globals.css).
    // On paper the background is plain white.
    <main
      id="main"
      data-theme="admin"
      className="flex flex-1 flex-col items-center bg-admin-bg px-4 py-6 print:bg-white print:p-0 lg:py-10"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <Suspense fallback={<AdminLoading label="the receipt" blocks={2} />}>
          <Receipt params={params} />
        </Suspense>
      </div>
    </main>
  );
}

// Loads the booking and the cafe details, then draws the receipt.
// Takes: the params promise.
// Gives back: the Back / Print row and the receipt sheet, a short message
// if nothing was paid yet, or the "page not found" page for a wrong id.
async function Receipt({ params }: { params: PageProps<"/admin/receipt/[bookingId]">["params"] }) {
  await requireAdmin();
  const { bookingId } = await params;

  let booking: AdminBookingDetails | null;
  let settings;
  try {
    [booking, settings] = await Promise.all([getAdminBooking(bookingId), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals (e.g. redirects)
    console.error(error);
    return <AdminLoadError what="the receipt" />;
  }
  if (!booking) notFound();

  // Only money actually received goes on a receipt. Payments made on the
  // booking this one was transferred from are included (they paid for it).
  const paid = booking.payments
    .filter((pay) => pay.status === "paid")
    .sort((a, b) => (a.paid_at ?? a.created_at).localeCompare(b.paid_at ?? b.created_at));
  const backHref = `/admin/bookings/${booking.booking_id}`;

  const backLink = (
    <Link
      href={backHref}
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-sm font-semibold text-brown hover:underline print:hidden"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to the booking
    </Link>
  );

  if (paid.length === 0) {
    return (
      <>
        {backLink}
        <p className="rounded-3xl border border-admin-line bg-white p-6 text-sm text-muted">
          This booking has no paid payment yet, so there is no receipt to print.
        </p>
      </>
    );
  }

  const classFee = Number(booking.class_fee);
  const matFee = Number(booking.mat_fee);
  const discount = Number(booking.discount);
  const totalPaid = paid.reduce((sum, pay) => sum + Number(pay.amount), 0);
  const date = formatClassDate(booking.class_date);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {backLink}
        <PrintButton label="Print receipt" />
      </div>

      {/* The receipt sheet. On paper: no box, no rounded corners. */}
      <article
        aria-label="Receipt"
        className="flex flex-col gap-6 rounded-3xl border border-admin-line bg-white p-6 text-ink sm:p-8 print:rounded-none print:border-0 print:p-0"
      >
        {/* Cafe on the left, receipt numbers on the right */}
        <header className="flex flex-col gap-4 border-b-2 border-brown pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-heading text-2xl font-semibold text-brown">{settings.cafeName}</p>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Mat Pilates + Café</p>
            {settings.cafeAddress && <p className="mt-2 text-sm">{settings.cafeAddress}</p>}
            {settings.cafeEmail && <p className="text-sm">{settings.cafeEmail}</p>}
          </div>
          <div className="sm:text-right">
            <h1 className="font-heading text-xl font-semibold uppercase tracking-[0.08em] text-brown">Receipt</h1>
            <dl className="mt-1 grid grid-cols-[auto_auto] justify-start gap-x-3 text-sm sm:justify-end">
              <dt className="text-muted">Receipt no.</dt>
              <dd className="font-semibold">{receiptNumber(paid[0].id)}</dd>
              <dt className="text-muted">Booking no.</dt>
              <dd className="font-semibold">{bookingReference(booking.booking_id)}</dd>
              <dt className="text-muted">Date issued</dt>
              <dd>{formatManilaDateTime(new Date(nowForThisVisit()))}</dd>
            </dl>
          </div>
        </header>

        {/* Who and what */}
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Detail label="Billed to">
            <span className="block font-semibold">{booking.guest_name}</span>
            {booking.guest_email && <span className="block break-all">{booking.guest_email}</span>}
            {booking.guest_contact && <span className="block">{booking.guest_contact}</span>}
            {booking.is_walkin && <span className="block text-muted">Walk-in booking</span>}
          </Detail>
          <Detail label="Class">
            <span className="block font-semibold">Mindful Mat Pilates</span>
            <span className="block">
              {date.full} · {formatTimeRange(booking.start_time, booking.end_time)}
            </span>
            {booking.session_status === "cancelled" && (
              <span className="block text-muted">Cancelled by the cafe (free transfer)</span>
            )}
          </Detail>
        </dl>

        {/* The items, line by line (the amounts saved on the booking) */}
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Items</caption>
          <thead>
            <tr className="border-b border-admin-line text-left text-xs uppercase tracking-[0.08em] text-muted">
              <th scope="col" className="py-2 font-semibold">
                Item
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-admin-line">
              <th scope="row" className="py-2.5 text-left font-normal">
                Mindful Mat Pilates class fee
                <span className="block text-xs text-muted">
                  Includes an upsized {booking.drink_choice ?? "drink (chosen at the cafe)"}
                </span>
              </th>
              <td className="py-2.5 text-right align-top">{formatPeso(classFee)}</td>
            </tr>
            {booking.mat_rental && (
              <tr className="border-b border-admin-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  Mat rental
                  <span className="block text-xs text-muted">Donated to feed stray animals</span>
                </th>
                <td className="py-2.5 text-right align-top">{formatPeso(matFee)}</td>
              </tr>
            )}
            {discount > 0 && (
              <tr className="border-b border-admin-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  Voucher{booking.voucher_code ? ` ${booking.voucher_code}` : ""}
                  <span className="block text-xs text-muted">Class fee only</span>
                </th>
                <td className="py-2.5 text-right align-top">−{formatPeso(discount)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-3 text-left font-heading text-base font-semibold text-brown">
                Total
              </th>
              <td className="pt-3 text-right font-heading text-base font-semibold text-brown">
                {formatPeso(Number(booking.total))}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* How it was paid */}
        <section aria-labelledby="receipt-payments" className="flex flex-col gap-2">
          <h2 id="receipt-payments" className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">
            Payment
          </h2>
          <ul className="flex flex-col divide-y divide-admin-line rounded-2xl border border-admin-line text-sm">
            {paid.map((pay) => (
              <li key={pay.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
                <span>
                  <span className="block font-semibold">{paymentMethodName(pay.method, pay.provider)}</span>
                  <span className="block text-xs text-muted">
                    {pay.paid_at && <>Paid {formatManilaDateTime(pay.paid_at)}</>}
                    {pay.paymongo_ref && <> · Ref {pay.paymongo_ref}</>}
                  </span>
                </span>
                <span className="font-semibold">{formatPeso(Number(pay.amount))}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between gap-3 px-4 text-sm font-semibold">
            Amount paid
            <span className="font-heading text-base text-brown">{formatPeso(totalPaid)}</span>
          </p>
        </section>

        <footer className="border-t border-admin-line pt-4 text-xs leading-relaxed text-muted">
          Thank you for joining us at {settings.cafeName}. This receipt is for one seat in one class. Card and bank
          details are never stored by the cafe.
        </footer>
      </article>
    </>
  );
}

// One labelled detail on the receipt (small brown capitals above the value).
// Takes: the label and the value.
// Gives back: a <div> with a <dt> and <dd> (inside the receipt's <dl>).
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brown">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
