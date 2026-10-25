// Turns a payment (client) or a booking (admin) into ReceiptData: the words
// and amounts a receipt shows. The on-screen receipt
// (src/components/receipt/ReceiptSheet.tsx) and the PDF
// (src/lib/receipt-pdf.ts) both draw this, so they always match.
// Where it's used: /account/payments/[paymentId] (+ /pdf) and
// /admin/receipt/[bookingId] (+ /pdf).
// Money: only the amounts SAVED on the booking and payments; nothing is
// recalculated. No card or bank numbers are ever stored, so none can show.

import { bookingReference, paymentMethodName, paymentStatusBadge, receiptNumber } from "@/lib/booking-rules";
import { formatClassDate, formatManilaDateTime, formatTimeRange } from "@/lib/format";
import { buildReceiptPdf, receiptFileName, type ReceiptData } from "@/lib/receipt-pdf";
import type { AdminBookingDetails, MyPayment } from "@/types/app";

// The cafe details at the top of every receipt (from Settings).
export type ReceiptCafe = ReceiptData["cafe"];

// The class lines: the class name, its date and time, and (if moved) the new class.
// Takes: the class date and times, the moved-to class (or nulls) and a
// note (e.g. "Cancelled by the cafe").
// Gives back: the lines.
function classLines(
  date: string,
  start: string,
  end: string,
  movedTo: { date: string | null; start: string | null; end: string | null },
  note: string | null,
): string[] {
  const lines = ["Mindful Mat Pilates", `${formatClassDate(date).full} · ${formatTimeRange(start, end)}`];
  if (movedTo.date && movedTo.start && movedTo.end) {
    lines.push(`Moved to ${formatClassDate(movedTo.date).full} · ${formatTimeRange(movedTo.start, movedTo.end)}`);
  }
  if (note) lines.push(note);
  return lines;
}

// The items: class fee (with the drink), mat rental and voucher.
// Takes: the saved fees, mat, drink and voucher of the booking.
// Gives back: the item lines (a voucher is a minus amount).
function receiptItems(booking: {
  class_fee: number;
  mat_fee: number;
  discount: number;
  mat_rental: boolean;
  drink_choice: string | null;
  voucher_code: string | null;
}): ReceiptData["items"] {
  const items: ReceiptData["items"] = [
    {
      label: "Mindful Mat Pilates class fee",
      note: `Includes an upsized ${booking.drink_choice ?? "drink (chosen at the cafe)"}`,
      amount: Number(booking.class_fee),
    },
  ];
  if (booking.mat_rental) {
    items.push({ label: "Mat rental", note: "Donated to feed stray animals", amount: Number(booking.mat_fee) });
  }
  if (Number(booking.discount) > 0) {
    items.push({
      label: `Voucher${booking.voucher_code ? ` ${booking.voucher_code}` : ""}`,
      note: "Class fee only",
      amount: -Number(booking.discount),
    });
  }
  return items;
}

// A client's receipt for ONE of their payments.
// Takes: the payment (get_my_payments), the client's name and email, and the cafe.
// Gives back: the receipt data.
export function clientReceiptData(
  payment: MyPayment,
  client: { name: string; email: string },
  cafe: ReceiptCafe,
): ReceiptData {
  return {
    cafe,
    receiptNo: receiptNumber(payment.payment_id),
    bookingNo: bookingReference(payment.booking_id),
    datePaid: payment.paid_at ? formatManilaDateTime(payment.paid_at) : "Not paid",
    client: { name: client.name || client.email, email: client.name ? client.email : null, contact: null },
    classLines: classLines(
      payment.class_date,
      payment.start_time,
      payment.end_time,
      { date: payment.now_date, start: payment.now_start_time, end: payment.now_end_time },
      null,
    ),
    items: receiptItems(payment),
    total: Number(payment.total),
    payments: [
      {
        method: paymentMethodName(payment.method, payment.provider),
        reference: payment.paymongo_ref,
        amount: Number(payment.amount),
      },
    ],
    status: paymentStatusBadge(payment.status, payment.provider).label,
  };
}

// The admin's receipt for one booking: all its PAID payments (also those
// on the booking it was moved from).
// Takes: the booking (admin_get_booking) and the cafe.
// Gives back: the receipt data, or null when nothing was paid yet.
export function adminReceiptData(booking: AdminBookingDetails, cafe: ReceiptCafe): ReceiptData | null {
  const paid = booking.payments
    .filter((pay) => pay.status === "paid")
    .sort((a, b) => (a.paid_at ?? a.created_at).localeCompare(b.paid_at ?? b.created_at));
  if (paid.length === 0) return null;
  const lastPaid = paid[paid.length - 1];

  return {
    cafe,
    // The first payment's number, so the same booking always gets the same receipt no.
    receiptNo: receiptNumber(paid[0].id),
    bookingNo: bookingReference(booking.booking_id),
    datePaid: formatManilaDateTime(lastPaid.paid_at ?? lastPaid.created_at),
    client: { name: booking.guest_name, email: booking.guest_email, contact: booking.guest_contact },
    classLines: classLines(
      booking.class_date,
      booking.start_time,
      booking.end_time,
      { date: null, start: null, end: null },
      booking.session_status === "cancelled" ? "Cancelled by the cafe (free transfer)" : null,
    ),
    items: receiptItems(booking),
    total: Number(booking.total),
    payments: paid.map((pay) => ({
      method: paymentMethodName(pay.method, pay.provider),
      reference: pay.paymongo_ref,
      amount: Number(pay.amount),
    })),
    status: "Paid",
  };
}

// Makes the receipt PDF and wraps it as a file download.
// Takes: the receipt data.
// Gives back: a Response with the PDF, named Block69-Receipt-<receipt no>.pdf.
// "private, no-store": a receipt has personal details, so no shared cache
// (or the browser's back button) may keep a copy.
export async function receiptPdfResponse(data: ReceiptData): Promise<Response> {
  const bytes = await buildReceiptPdf(data);
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptFileName(data.receiptNo)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// A short plain-text answer when there's no receipt to download.
// Takes: the HTTP status (401, 403, 404, 409 or 500) and the message.
// Gives back: the Response.
export function receiptErrorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
