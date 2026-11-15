// The pieces of one appointment's details that the admin's two booking pages
// share (Version 1.6):
//   - the eye view   /admin/appointments/[bookingId]         (read-only + PDF)
//   - the pencil     /admin/appointments/[bookingId]/manage  (the actions)
// They used to live in the old booking details page (/admin/bookings/[id]).
// Server components only: they just show what admin_get_booking and
// admin_booking_change_info gave back.

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { appointmentStatus } from "@/lib/admin/display";
import { adminSeatsBadge, paymentMethodName } from "@/lib/booking-rules";
import { formatClassDate, formatManilaDateTime, formatPeso, formatTime, formatTimeRange } from "@/lib/format";
import type { AdminBookingAction, AdminBookingDetails, AdminBookingPayment } from "@/types/app";
import { AdminCard, AdminOverline } from "./AdminUi";

// The class line used in headings and boxes.
// Takes: the booking. Gives back: e.g. "Thu, Nov 19 · 9:00 – 9:50 AM".
export function classLabelOf(booking: AdminBookingDetails): string {
  return `${formatClassDate(booking.class_date).short} · ${formatTimeRange(booking.start_time, booking.end_time)}`;
}

// The status under the guest's name: the simple badge, then the exact reason.
// Takes: the badge word and colour, and the reason (or null).
// Gives back: e.g. [Cancelled] · No-show.
export function StatusLine({ label, variant, reason }: { label: string; variant: BadgeVariant; reason: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant={variant}>{label}</Badge>
      {reason && <span className="text-sm text-ink">{reason}</span>}
    </span>
  );
}

// The yellow "know this first" boxes at the top of a booking page.
// Takes: the booking, and manageHref = where the pencil page is (the boxes
// point there for the things to do).
// Gives back: zero or more boxes.
export function AppointmentNotices({ booking, manageHref }: { booking: AdminBookingDetails; manageHref: string }) {
  const sessionCancelled = booking.session_status === "cancelled";
  const pendingManual = booking.payments.some((pay) => pay.provider === "manual" && pay.status === "pending");
  const holdInCancelled =
    sessionCancelled &&
    (booking.status === "pending_payment" || booking.status === "expired") &&
    !booking.payments.some((pay) => pay.status === "paid" || pay.status === "rejected");
  const manage = (
    <Link href={manageHref} className="font-semibold underline underline-offset-2">
      Manage
    </Link>
  );

  return (
    <>
      {booking.shown_status === "paid_needs_action" && (
        <Notice>
          This client paid, but the seat couldn&apos;t be confirmed (the payment came after the hold ended and the
          class was full, the class was cancelled, closed or had started, or the amount didn&apos;t match the total;
          compare the payments below). If the payment covers the total, the client can move to any open class for
          free from My Bookings. Otherwise, contact them and cancel it in {manage} (for a refund, refund outside the
          website first).
        </Notice>
      )}
      {pendingManual && <Notice>A GCash / BPI transfer screenshot is waiting to be checked. Confirm or reject it in {manage}.</Notice>}
      {sessionCancelled && (booking.status === "confirmed" || booking.status === "paid_needs_action") && (
        <Notice>
          This class was cancelled by the cafe. The client&apos;s payment remains valid: they can transfer to any open
          class at no additional cost through My Bookings, or you can re-schedule them in {manage}.
        </Notice>
      )}
      {sessionCancelled && booking.status === "awaiting_verification" && (
        <Notice>
          This class was cancelled by the cafe while the transfer is still being checked. Once you confirm it, the
          client can move to another open class for free (or you can re-schedule them).
        </Notice>
      )}
      {holdInCancelled && (
        <Notice>This class was cancelled by the cafe, so this unpaid seat hold was released. The client was not charged.</Notice>
      )}
    </>
  );
}

// The Class card: date, time, seats (no Cancel class button: Version 1.6
// moved cancelling a class to the Schedule page only).
// Takes: the booking. Gives back: the card.
export function ClassDetailsCard({ booking }: { booking: AdminBookingDetails }) {
  const seats = adminSeatsBadge(booking.capacity - booking.seats_left, booking.capacity, booking.session_status);
  return (
    <AdminCard className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <AdminOverline as="h2">Class</AdminOverline>
          <p className="mt-1 font-heading text-lg font-semibold text-brown">{classLabelOf(booking)}</p>
        </div>
        <Badge variant={seats.variant}>{seats.label}</Badge>
      </div>
      <p className="text-sm text-muted">
        {booking.session_status === "cancelled"
          ? "Cancelled by the cafe."
          : `${booking.seats_left} of ${booking.capacity} seats free right now.`}
      </p>
    </AdminCard>
  );
}

// The Guest card: name, account, contact, health answers and agreement.
// Takes: the booking. Gives back: the card.
export function GuestDetailsCard({ booking }: { booking: AdminBookingDetails }) {
  return (
    <AdminCard className="flex flex-col gap-3">
      <AdminOverline as="h2">Guest</AdminOverline>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <Row label="Name">{booking.guest_name}</Row>
        <Row label="Account">
          {booking.is_walkin
            ? "Walk-in (no account)"
            : booking.account_active === false
              ? "Deactivated account"
              : "Client account"}
        </Row>
        <Row label="Mobile">
          {booking.guest_contact ? (
            <a href={`tel:${booking.guest_contact.replace(/[^\d+]/g, "")}`} className="text-brown underline underline-offset-2">
              {booking.guest_contact}
            </a>
          ) : (
            "Not given"
          )}
        </Row>
        {booking.guest_email && (
          <Row label="Email">
            <a href={`mailto:${booking.guest_email}`} className="break-all text-brown underline underline-offset-2">
              {booking.guest_email}
            </a>
          </Row>
        )}
        {booking.guest_instagram && <Row label="Instagram">@{booking.guest_instagram}</Row>}
        <Row label="First time">{booking.first_time ? "Yes" : "No"}</Row>
        <Row label="Health notes">
          {booking.health_notes ? (
            <span className="whitespace-pre-line font-semibold text-warning">{booking.health_notes}</span>
          ) : (
            "None"
          )}
        </Row>
        {/* Empty = not asked: online bookings since Change 17 have no
            not-pregnant tick (walk-ins still confirm it in person) */}
        <Row label="Not pregnant">
          {booking.not_pregnant_confirmed === true
            ? "Confirmed"
            : booking.not_pregnant_confirmed === false
              ? "Not confirmed"
              : "Not asked (online booking)"}
        </Row>
        <Row label="Agreement">{booking.agreed_at ? `Agreed ${formatManilaDateTime(booking.agreed_at)}` : "Not agreed"}</Row>
      </dl>
    </AdminCard>
  );
}

// The Order card: drink, mat, fees, voucher and total.
// Takes: the booking. Gives back: the card.
export function OrderDetailsCard({ booking }: { booking: AdminBookingDetails }) {
  return (
    <AdminCard className="flex flex-col gap-3">
      <AdminOverline as="h2">Order</AdminOverline>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
        <Row label="Drink">{booking.drink_choice ?? "Decide at the cafe"}</Row>
        <Row label="Mat">{booking.mat_rental ? "Rented" : "Own mat"}</Row>
        <Row label="Class fee">{formatPeso(Number(booking.class_fee))}</Row>
        {booking.mat_rental && <Row label="Mat rental (to the strays)">{formatPeso(Number(booking.mat_fee))}</Row>}
        {Number(booking.discount) > 0 && (
          <Row label={`Voucher ${booking.voucher_code ?? ""}`.trim()}>−{formatPeso(Number(booking.discount))}</Row>
        )}
      </dl>
      <p className="flex items-baseline justify-between gap-3 border-t border-admin-line pt-3 text-sm font-semibold">
        Total
        <span className="font-heading text-base text-brown">{formatPeso(Number(booking.total))}</span>
      </p>
    </AdminCard>
  );
}

// The Payments card: every payment (also the original booking's after a move).
// Takes: the booking. Gives back: the card.
export function PaymentsDetailsCard({ booking }: { booking: AdminBookingDetails }) {
  return (
    <AdminCard className="flex flex-col gap-3">
      <AdminOverline as="h2">Payments</AdminOverline>
      {booking.payments.length === 0 ? (
        <p className="text-sm text-muted">No payment yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-admin-line">
          {booking.payments.map((pay) => (
            <PaymentRow key={pay.id} payment={pay} onOriginal={pay.booking_id !== booking.booking_id} />
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

// The History card: a short history built from the times the database keeps,
// plus every admin action with its reason.
// Takes: the booking and its admin actions.
// Gives back: the card.
export function HistoryCard({ booking, actions }: { booking: AdminBookingDetails; actions: AdminBookingAction[] }) {
  return (
    <AdminCard className="flex flex-col gap-3">
      <AdminOverline as="h2">History</AdminOverline>
      <ol className="flex flex-col gap-2.5 border-l-2 border-admin-active pl-4">
        {historyOf(booking, actions).map((event, n) => (
          <li key={n} className="text-sm">
            <span className="block text-xs text-muted">{formatManilaDateTime(event.at)}</span>
            {event.text}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Built from the times the database keeps. Every status change isn&apos;t saved separately.</p>
    </AdminCard>
  );
}

// The admin's badge for a payment status.
// Takes: one payment. Gives back: the badge text and colour.
export function adminPaymentBadge(payment: AdminBookingPayment): { label: string; variant: BadgeVariant } {
  switch (payment.status) {
    case "paid":
      return { label: "Paid", variant: "success" };
    case "pending":
      return payment.provider === "manual"
        ? { label: "Needs checking", variant: "info" }
        : { label: "Checkout open", variant: "warning" };
    case "failed":
      return { label: "Failed", variant: "error" };
    case "expired":
      return { label: "Expired", variant: "error" };
    case "rejected":
      return { label: "Rejected", variant: "error" };
    case "refunded":
      return { label: "Refunded", variant: "neutral" };
  }
}

// One label + value row in a details list.
// Takes: the label and the value. Gives back: a <dt> and a <dd>.
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  );
}

// A yellow box for things the admin should know first.
// Takes: the message. Gives back: the box.
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm leading-relaxed text-warning">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

// One payment in the Payments card.
// Takes: the payment, and onOriginal = true if it sits on the booking this
// one was transferred from.
// Gives back: an <li> with method, amount, status and details.
function PaymentRow({ payment, onOriginal }: { payment: AdminBookingPayment; onOriginal: boolean }) {
  const badge = adminPaymentBadge(payment);
  return (
    <li className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">
          {formatPeso(Number(payment.amount))} · {paymentMethodName(payment.method, payment.provider)}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="text-xs text-muted">
        {payment.paid_at ? `Paid ${formatManilaDateTime(payment.paid_at)}` : `Started ${formatManilaDateTime(payment.created_at)}`}
        {payment.paymongo_ref && <> · Ref {payment.paymongo_ref}</>}
        {payment.verified_by_name && <> · {payment.provider === "manual" ? "checked" : "recorded"} by {payment.verified_by_name}</>}
        {payment.has_screenshot && <> · screenshot uploaded</>}
        {onOriginal && <> · paid on the original booking (before the transfer)</>}
      </p>
    </li>
  );
}

// Builds a short history of the booking from the times the database keeps,
// plus every cancel / transfer / re-schedule / rejected payment an admin did
// (with the admin's reason).
// Takes: the booking and its admin changes.
// Gives back: events { at, text }, oldest first.
function historyOf(booking: AdminBookingDetails, actions: AdminBookingAction[]): { at: string; text: ReactNode }[] {
  const events: { at: string; text: ReactNode }[] = [];

  events.push({
    at: booking.created_at,
    text: booking.is_walkin
      ? "Walk-in booking added at the counter"
      : booking.moved_from_booking_id
        ? "Made by moving another booking"
        : "Booked online (seat held while paying)",
  });

  if (booking.moved_from_booking_id && booking.moved_from_date && booking.moved_from_start_time) {
    events.push({
      at: booking.created_at,
      text: (
        <>
          Moved here from{" "}
          <Link href={`/admin/appointments/${booking.moved_from_booking_id}`} className="text-brown underline underline-offset-2">
            {formatClassDate(booking.moved_from_date).short} · {formatTime(booking.moved_from_start_time)}
          </Link>
        </>
      ),
    });
  }

  for (const pay of booking.payments) {
    const method = paymentMethodName(pay.method, pay.provider);
    if (pay.paid_at) {
      events.push({ at: pay.paid_at, text: `Paid ${formatPeso(Number(pay.amount))} (${method})` });
    } else {
      events.push({ at: pay.created_at, text: `Payment started (${method}): ${adminPaymentBadge(pay).label.toLowerCase()}` });
    }
  }

  // An unpaid hold that ran out (or will)
  if (booking.status === "pending_payment" && booking.hold_expires_at) {
    events.push({
      at: booking.hold_expires_at,
      text: booking.shown_status === "expired" ? "Seat hold ended without payment" : "Seat hold ends (if not paid)",
    });
  }

  // The current status (or where it was moved to), at the last time the
  // booking changed
  if (booking.updated_at !== booking.created_at && booking.status !== "pending_payment") {
    const now = appointmentStatus(booking.status);
    events.push({
      at: booking.updated_at,
      text: booking.moved_to_booking_id ? (
        <>
          Moved to{" "}
          <Link href={`/admin/appointments/${booking.moved_to_booking_id}`} className="text-brown underline underline-offset-2">
            {booking.moved_to_date && formatClassDate(booking.moved_to_date).short}
            {booking.moved_to_start_time && ` · ${formatTime(booking.moved_to_start_time)}`}
          </Link>
        </>
      ) : (
        `Last change: now ${now.label.toLowerCase()}${now.reason ? ` (${now.reason.toLowerCase()})` : ""}`
      ),
    });
  }

  // What an admin did, who, and why (booking_admin_actions; admins only)
  for (const action of actions) {
    events.push({ at: action.created_at, text: <AdminActionEvent action={action} bookingId={booking.booking_id} /> });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// One admin change in the History list: what was done, by whom, whether it
// was an override, and the reason.
// Takes: the action and the id of the booking being shown (a move is listed
// on both the old and the new booking).
// Gives back: the text for the History list.
function AdminActionEvent({ action, bookingId }: { action: AdminBookingAction; bookingId: string }) {
  const onOld = action.booking_id === bookingId;
  const what: Record<AdminBookingAction["action"], string> = {
    transfer: onOld ? "Moved to another class by an admin" : "Moved here by an admin",
    reschedule: onOld ? "Re-scheduled to another class by an admin" : "Re-scheduled here by an admin",
    cancel_voucher: `Cancelled by an admin with a 50% code${action.voucher_code ? ` (${action.voucher_code})` : ""}`,
    cancel_no_credit: "Cancelled by an admin with no credit",
    reject_payment: "Payment rejected by an admin",
  };
  return (
    <span className="flex flex-col gap-1">
      <span>
        {what[action.action]}
        {action.admin_name && <> · {action.admin_name}</>} {action.overridden && <Badge variant="warning">Override</Badge>}
      </span>
      {action.note && <span className="whitespace-pre-line text-xs text-muted">Reason: {action.note}</span>}
    </span>
  );
}
