// One booking's details for the admin: /admin/bookings/<booking id>
// Where it's used: every row on the admin Bookings list, the Dashboard
// (guest names, Needs action) and the Attendance list.
// No mockup for this page: it follows the admin card style.
//
// What it shows: the class, the guest (account or walk-in), health answers,
// drink, mat, money and voucher, every payment (including the original
// booking's after a transfer), and a short history built from the times the
// database keeps (there is no full status log).
// Actions (only through the admin_* functions):
//   - Attended / No-show (admin_set_attendance), from the class day
//   - Cancel this class (admin_cancel_session)
//   - Cancel or transfer THIS booking (admin_cancel_booking /
//     admin_transfer_booking, migration 10), for confirmed bookings and late
//     payments. The normal rule needs no reason; an override does, and the
//     reason shows in History (admins only).
// Approving / rejecting a GCash or BPI screenshot is on the Payments page
// (Needs review), where the screenshot can be seen.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check (admin_get_booking, migration 9).

import { ArrowLeft, ListChecks, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AttendanceButtons } from "@/components/admin/AttendanceButtons";
import { BookingChangeBox } from "@/components/admin/BookingChangeBox";
import { AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { CancelClassButton } from "@/components/admin/CancelClassButton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/user";
import {
  adminBookingStatusBadge,
  adminSeatsBadge,
  bookingReference,
  classStartsAt,
  paymentMethodName,
} from "@/lib/booking-rules";
import { getAdminBooking, getAdminSessions } from "@/lib/data/admin";
import { getBookingChangeInfo } from "@/lib/data/admin-setup";
import {
  addDays,
  formatClassDate,
  formatManilaDateTime,
  formatPeso,
  formatTime,
  formatTimeRange,
  manilaDateString,
} from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type {
  AdminBookingAction,
  AdminBookingChangeInfo,
  AdminBookingDetails,
  AdminBookingPayment,
  AdminSession,
} from "@/types/app";

// How far ahead the Transfer box offers classes (6 weeks).
const TRANSFER_DAYS = 42;

export const metadata: Metadata = { title: "Booking details · Admin" };

// The booking details page.
// Takes: params (the booking id from the address).
// Gives back: a back link, then the live details inside <Suspense>.
export default function AdminBookingPage({ params }: PageProps<"/admin/bookings/[bookingId]">) {
  return (
    <AdminPage>
      <Link
        href="/admin/bookings"
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-sm font-semibold text-brown hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All bookings
      </Link>
      <Suspense fallback={<AdminLoading label="the booking" />}>
        <BookingDetails params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: everything about the booking.
// Takes: the params promise.
// Gives back: the heading and the cards, or the "page not found" page if
// the booking doesn't exist.
async function BookingDetails({ params }: { params: PageProps<"/admin/bookings/[bookingId]">["params"] }) {
  await requireAdmin();
  const { bookingId } = await params;

  // Read the clock once (a real visit: requireAdmin has run)
  const nowMs = nowForThisVisit();
  const today = manilaDateString(nowMs);

  let booking: AdminBookingDetails | null;
  let change: AdminBookingChangeInfo | null;
  let classes: AdminSession[];
  try {
    // The booking, what may be changed, and the classes it could move to
    [booking, change, classes] = await Promise.all([
      getAdminBooking(bookingId),
      getBookingChangeInfo(bookingId),
      getAdminSessions(today, addDays(today, TRANSFER_DAYS - 1)),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this booking" />;
  }
  if (!booking) notFound();

  // Classes the booking can move to: open, not ended, a free seat, not its own
  // (the database checks all of this again when moving)
  const ownSession = booking.session_id;
  const classOptions = classes
    .filter((item) => item.status === "open" && !item.has_ended && item.seats_left > 0 && item.session_id !== ownSession)
    .map((item) => ({
      value: item.session_id,
      label: `${formatClassDate(item.date).short} · ${formatTimeRange(item.start_time, item.end_time)} · ${item.seats_left} of ${item.capacity} free`,
    }));
  const actions = change?.actions ?? [];
  const holdSecondsLeft = booking.hold_expires_at
    ? Math.max(0, (new Date(booking.hold_expires_at).getTime() - nowMs) / 1000)
    : 0;
  const status = adminBookingStatusBadge(booking.shown_status, holdSecondsLeft);
  const seats = adminSeatsBadge(booking.capacity - booking.seats_left, booking.capacity, booking.session_status);
  const classLabel = `${formatClassDate(booking.class_date).short} · ${formatTimeRange(booking.start_time, booking.end_time)}`;
  const classEnded = classStartsAt(booking.class_date, booking.end_time).getTime() <= nowMs;
  const pendingManual = booking.payments.some((pay) => pay.provider === "manual" && pay.status === "pending");

  return (
    <>
      <AdminPageHeader
        overline={bookingReference(booking.booking_id)}
        title={booking.guest_name}
        intro={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {booking.is_walkin ? "Walk-in booking" : "Online booking"}
          </span>
        }
      />

      {/* Things the admin should know first */}
      {booking.shown_status === "paid_needs_action" && (
        <Notice>
          This client paid, but the seat couldn&apos;t be confirmed (the payment came after the hold ended and the
          class was full, the class was cancelled, closed or had started, or the amount didn&apos;t match the total;
          compare the payments below). Contact them to agree what to do, then use <strong>Cancel or transfer</strong>{" "}
          below (moving them to another class is the normal step; for a refund, refund outside the website first).
        </Notice>
      )}
      {pendingManual && (
        <Notice>
          A GCash / BPI transfer screenshot is waiting to be checked.{" "}
          <Link href="/admin/payments?view=review" className="font-semibold underline underline-offset-2">
            Check it in Payments
          </Link>
          .
        </Notice>
      )}
      {booking.session_status === "cancelled" && booking.status === "confirmed" && (
        <Notice>
          The cafe cancelled this class. The client keeps this booking and can move it to another class for free from
          My Bookings.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          {/* ---- The class ---- */}
          <AdminCard className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <AdminOverline as="h2">Class</AdminOverline>
                <p className="mt-1 font-heading text-lg font-semibold text-brown">{classLabel}</p>
              </div>
              <Badge variant={seats.variant}>{seats.label}</Badge>
            </div>
            <p className="text-sm text-muted">
              {booking.session_status === "cancelled"
                ? "Cancelled by the cafe."
                : `${booking.seats_left} of ${booking.capacity} seats free right now.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/admin/attendance?session=${booking.session_id}`} variant="secondary">
                <ListChecks aria-hidden="true" className="size-4" />
                Attendance list
              </ButtonLink>
              {booking.session_status !== "cancelled" && !classEnded && (
                <CancelClassButton
                  sessionId={booking.session_id}
                  classLabel={classLabel}
                  bookedCount={booking.capacity - booking.seats_left}
                />
              )}
            </div>
          </AdminCard>

          {/* ---- The guest ---- */}
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
              <Row label="Agreement">
                {booking.agreed_at ? `Agreed ${formatManilaDateTime(booking.agreed_at)}` : "Not agreed"}
              </Row>
            </dl>
          </AdminCard>
        </div>

        <div className="flex flex-col gap-5">
          {/* ---- Cancel or transfer this booking ---- */}
          {change?.can_change && change.rule && (
            <AdminCard className="flex flex-col gap-3">
              <AdminOverline as="h2">Change this booking</AdminOverline>
              <p className="text-sm text-muted">
                Cancel it or move it to another class for the client. You follow the cancellation rules by default; a
                different choice needs a reason.
              </p>
              <div>
                <BookingChangeBox
                  bookingId={booking.booking_id}
                  guestName={booking.guest_name}
                  classLabel={classLabel}
                  rule={change.rule}
                  normalAction={change.normal_action}
                  voucherAllowed={change.voucher_allowed}
                  classOptions={classOptions}
                />
              </div>
            </AdminCard>
          )}

          {/* ---- Attendance ---- */}
          {(booking.can_mark_attendance || booking.status === "confirmed") && (
            <AdminCard className="flex flex-col gap-3">
              <AdminOverline as="h2">Attendance</AdminOverline>
              {booking.can_mark_attendance ? (
                <AttendanceButtons bookingId={booking.booking_id} status={booking.status} guestName={booking.guest_name} />
              ) : (
                <p className="text-sm text-muted">Attendance can be marked from the class day.</p>
              )}
            </AdminCard>
          )}

          {/* ---- Drink, mat and money ---- */}
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

          {/* ---- Payments ---- */}
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

          {/* ---- History ---- */}
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
            <p className="text-xs text-muted">
              Built from the times the database keeps. Every status change isn&apos;t saved separately.
            </p>
          </AdminCard>
        </div>
      </div>
    </>
  );
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

// The admin's badge for a payment status.
// Takes: one payment. Gives back: the badge text and color.
function adminPaymentBadge(payment: AdminBookingPayment): { label: string; variant: BadgeVariant } {
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

// Builds a short history of the booking from the times the database keeps,
// plus every cancel / transfer an admin did (with the admin's reason).
// Takes: the booking and its admin changes.
// Gives back: events { at, text }, oldest first.
function historyOf(booking: AdminBookingDetails, actions: AdminBookingAction[]): { at: string; text: ReactNode }[] {
  const events: { at: string; text: ReactNode }[] = [];

  events.push({
    at: booking.created_at,
    text: booking.is_walkin
      ? "Walk-in booking added at the counter"
      : booking.moved_from_booking_id
        ? "Made by transferring another booking"
        : "Booked online (seat held while paying)",
  });

  if (booking.moved_from_booking_id && booking.moved_from_date && booking.moved_from_start_time) {
    events.push({
      at: booking.created_at,
      text: (
        <>
          Moved here from{" "}
          <Link href={`/admin/bookings/${booking.moved_from_booking_id}`} className="text-brown underline underline-offset-2">
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

  // The current status, at the last time the booking changed
  if (booking.updated_at !== booking.created_at && booking.status !== "pending_payment") {
    events.push({
      at: booking.updated_at,
      text: booking.moved_to_booking_id ? (
        <>
          Transferred to{" "}
          <Link href={`/admin/bookings/${booking.moved_to_booking_id}`} className="text-brown underline underline-offset-2">
            {booking.moved_to_date && formatClassDate(booking.moved_to_date).short}
            {booking.moved_to_start_time && ` · ${formatTime(booking.moved_to_start_time)}`}
          </Link>
        </>
      ) : (
        `Last change: now ${adminBookingStatusBadge(booking.status).label.toLowerCase()}`
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
// Takes: the action and the id of the booking being shown (a transfer is
// listed on both the old and the new booking).
// Gives back: the text for the History list.
function AdminActionEvent({ action, bookingId }: { action: AdminBookingAction; bookingId: string }) {
  const what =
    action.action === "transfer"
      ? action.booking_id === bookingId
        ? "Moved to another class by an admin"
        : "Moved here by an admin"
      : action.action === "cancel_voucher"
        ? `Cancelled by an admin with a 50% code${action.voucher_code ? ` (${action.voucher_code})` : ""}`
        : "Cancelled by an admin with no credit";
  return (
    <span className="flex flex-col gap-1">
      <span>
        {what}
        {action.admin_name && <> · {action.admin_name}</>}{" "}
        {action.overridden && <Badge variant="warning">Override</Badge>}
      </span>
      {action.note && <span className="whitespace-pre-line text-xs text-muted">Reason: {action.note}</span>}
    </span>
  );
}
