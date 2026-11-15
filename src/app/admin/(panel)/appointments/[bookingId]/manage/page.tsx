// Manage one appointment (the pencil button, Version 1.6):
// /admin/appointments/<booking id>/manage
// Where it's used: the pencil icon on the Appointments list, "Manage" on the
// view page, and the Dashboard's "Needs action" list.
// No mockup for this page: it follows the admin card style.
//
// What the admin can do here (each only when it applies; the database
// checks every rule again):
//   - Confirm: only while a GCash / BPI screenshot waits (awaiting
//     verification). The screenshot is shown full size (a private 10-minute
//     link). Confirm = admin_review_manual_payment (approve).
//   - Reject payment: the same time, with a required reason
//     (admin_reject_payment, migration 24).
//   - Re-schedule: move to another open class (not started, a seat free,
//     before the 8:00 AM cutoff), free, with a required reason. Only for
//     confirmed bookings, or late payments in a class the cafe cancelled
//     (admin_reschedule_booking, migration 24). The client gets an update in
//     their bell and an email.
//   - Cancel this booking: the existing rule with the 50% code / no-credit
//     choices and the override reason (admin_cancel_booking, migration 10).
//   - Attendance: Attended / No-show (paid bookings, from the class day).
// Payment review used to be on the Payments page; it lives here now.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import {
  AppointmentNotices,
  ClassDetailsCard,
  OrderDetailsCard,
  PaymentsDetailsCard,
  StatusLine,
  classLabelOf,
} from "@/components/admin/AppointmentDetails";
import { AttendanceButtons } from "@/components/admin/AttendanceButtons";
import { BookingChangeBox } from "@/components/admin/BookingChangeBox";
import { ConfirmActionButton } from "@/components/admin/ConfirmActionButton";
import { RejectPaymentButton } from "@/components/admin/RejectPaymentButton";
import { RescheduleBox } from "@/components/admin/RescheduleBox";
import { ButtonLink } from "@/components/ui/Button";
import type { SelectOption } from "@/components/ui/Select";
import { bookingDetailsStatus } from "@/lib/admin/appointment-status";
import { reviewPayment } from "@/lib/admin/setup-actions";
import { requireAdmin } from "@/lib/auth/user";
import { bookingReference, paymentMethodName } from "@/lib/booking-rules";
import { getAdminBooking } from "@/lib/data/admin";
import { getAdminPayments, getBookingChangeInfo, getScreenshotLinks } from "@/lib/data/admin-setup";
import { getBookingSessions } from "@/lib/data/booking";
import { addDays, formatClassDate, formatManilaDateTime, formatPeso, formatTimeRange, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBookingChangeInfo, AdminBookingDetails, AdminBookingPayment } from "@/types/app";

export const metadata: Metadata = { title: "Manage appointment · Admin" };

// How many days ahead the Re-schedule list looks (clients book this month and
// next month, so about 2 months).
const RESCHEDULE_DAYS_AHEAD = 62;

// The manage page.
// Takes: params (the booking id from the address).
// Gives back: a back link, then the live part inside <Suspense>.
export default function ManageAppointmentPage({ params }: PageProps<"/admin/appointments/[bookingId]/manage">) {
  return (
    <AdminPage>
      <Suspense fallback={<AdminLoading label="the appointment" />}>
        <ManageAppointment params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the actions that apply, next to a short summary.
// Takes: the params promise.
// Gives back: the heading and the cards, or "page not found".
async function ManageAppointment({ params }: { params: PageProps<"/admin/appointments/[bookingId]/manage">["params"] }) {
  await requireAdmin();
  const { bookingId } = await params;
  const nowMs = nowForThisVisit();

  let booking: AdminBookingDetails | null;
  let change: AdminBookingChangeInfo | null;
  try {
    [booking, change] = await Promise.all([getAdminBooking(bookingId), getBookingChangeInfo(bookingId)]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this appointment" />;
  }
  if (!booking) notFound();

  const status = bookingDetailsStatus(booking, nowMs);
  const viewHref = `/admin/appointments/${booking.booking_id}`;
  const classLabel = classLabelOf(booking);

  // ---- Which actions apply (display only; the database decides) ----
  // A GCash / BPI screenshot waiting for a check
  const pendingManual =
    booking.status === "awaiting_verification"
      ? booking.payments.find((pay) => pay.provider === "manual" && pay.status === "pending")
      : undefined;
  // Re-schedule: confirmed, or a late payment in a class the cafe cancelled
  const canReschedule =
    booking.status === "confirmed" || (booking.status === "paid_needs_action" && booking.session_status === "cancelled");
  const canCancel = Boolean(change?.can_change && change.rule);

  // ---- What those actions need ----
  let screenshotUrl: string | undefined;
  let screenshotSaved = false;
  let classOptions: SelectOption[] = [];
  try {
    const [screenshot, options] = await Promise.all([
      pendingManual ? screenshotFor(booking.booking_id, pendingManual) : Promise.resolve({ url: undefined, saved: false }),
      canReschedule ? rescheduleOptions(booking, nowMs) : Promise.resolve([]),
    ]);
    screenshotUrl = screenshot.url;
    screenshotSaved = screenshot.saved;
    classOptions = options;
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this appointment" />;
  }

  const nothingToDo = !pendingManual && !canReschedule && !canCancel && !booking.can_mark_attendance;

  return (
    <>
      <Link
        href={viewHref}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-sm font-semibold text-brown hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the appointment
      </Link>

      <AdminPageHeader
        overline={`Manage · ${bookingReference(booking.booking_id)}`}
        title={booking.guest_name}
        intro={<StatusLine label={status.label} variant={status.variant} reason={status.reason} />}
        actions={
          <ButtonLink href={viewHref} variant="secondary">
            <Eye aria-hidden="true" className="size-4" />
            View details
          </ButtonLink>
        }
      />

      <AppointmentNotices booking={booking} manageHref={`${viewHref}/manage`} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          {/* ---- Confirm / reject a GCash or BPI transfer ---- */}
          {pendingManual && (
            <ActionCard title="Check the payment">
              <p className="text-sm">
                <span className="font-heading text-lg font-semibold text-brown">{formatPeso(Number(pendingManual.amount))}</span>{" "}
                by {paymentMethodName(pendingManual.method, pendingManual.provider)} · sent{" "}
                {formatManilaDateTime(pendingManual.created_at)}
              </p>
              <p className="text-xs text-muted">
                Check that this amount arrived in the cafe&apos;s {pendingManual.method === "bpi" ? "BPI account" : "GCash"}{" "}
                before confirming. The seat stays held until you decide.
              </p>
              {screenshotUrl ? (
                <figure className="flex flex-col gap-2">
                  {/* Full size. A plain <img>: next/image only loads the PUBLIC
                      site-images bucket, and this private link only works for 10 minutes */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    alt={`Payment screenshot from ${booking.guest_name}`}
                    className="h-auto w-full rounded-xl border border-admin-line bg-admin-bg"
                  />
                  <a
                    href={screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 text-sm font-semibold text-brown underline underline-offset-2"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Open in a new tab
                  </a>
                </figure>
              ) : (
                <p className="rounded-xl bg-warning-bg px-3.5 py-3 text-xs text-warning">
                  {screenshotSaved
                    ? "The screenshot file couldn't be found. Ask the client to send it by message."
                    : "No screenshot was uploaded with this payment."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <ConfirmActionButton
                  action={reviewPayment}
                  fields={{ payment_id: pendingManual.id, decision: "approve" }}
                  label="Confirm"
                  srLabel={` ${booking.guest_name}'s payment`}
                  variant="primary"
                  confirm={{
                    title: "Confirm this payment?",
                    body: `${formatPeso(Number(pendingManual.amount))} from ${booking.guest_name}. Their booking becomes confirmed.`,
                    confirmLabel: "Yes, confirm",
                  }}
                />
                <RejectPaymentButton
                  paymentId={pendingManual.id}
                  guestName={booking.guest_name}
                  amount={formatPeso(Number(pendingManual.amount))}
                />
              </div>
            </ActionCard>
          )}

          {/* ---- Re-schedule (free, reason required) ---- */}
          {canReschedule && (
            <ActionCard title="Re-schedule">
              <p className="text-sm text-muted">
                {booking.session_status === "cancelled"
                  ? "The cafe cancelled this class. Move the client to another open class for free."
                  : "Move this booking to another open class for free (for example, the client asked by message). The 24-hour and once-only rules don't apply to admins, but a reason is required."}
              </p>
              <div>
                <RescheduleBox
                  bookingId={booking.booking_id}
                  guestName={booking.guest_name}
                  classLabel={classLabel}
                  classOptions={classOptions}
                />
              </div>
            </ActionCard>
          )}

          {/* ---- Cancel this booking (the cancellation rules) ---- */}
          {canCancel && change?.rule && (
            <ActionCard title="Cancel this booking">
              <p className="text-sm text-muted">
                You follow the cancellation rules by default; a different choice needs a reason.
              </p>
              <div>
                <BookingChangeBox
                  bookingId={booking.booking_id}
                  guestName={booking.guest_name}
                  classLabel={classLabel}
                  rule={change.rule}
                  normalAction={change.normal_action}
                  voucherAllowed={change.voucher_allowed}
                />
              </div>
            </ActionCard>
          )}

          {/* ---- Attendance: only for PAID bookings, from the class day, not
               in a cancelled class (can_mark_attendance, migration 18) ---- */}
          {booking.can_mark_attendance && (
            <ActionCard title="Attendance">
              <AttendanceButtons bookingId={booking.booking_id} status={booking.status} guestName={booking.guest_name} />
            </ActionCard>
          )}

          {nothingToDo && (
            <AdminCard className="text-sm text-muted">
              Nothing to change: this appointment is {status.text.toLowerCase()}.
            </AdminCard>
          )}
        </div>

        {/* ---- A short summary next to the actions ---- */}
        <div className="flex flex-col gap-5">
          <ClassDetailsCard booking={booking} />
          <OrderDetailsCard booking={booking} />
          <PaymentsDetailsCard booking={booking} />
        </div>
      </div>
    </>
  );
}

// One action card with a small heading.
// Takes: the heading and the card's content. Gives back: the card.
function ActionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AdminCard className="flex flex-col gap-3">
      <AdminOverline as="h2">{title}</AdminOverline>
      {children}
    </AdminCard>
  );
}

// Finds the private link to a manual payment's screenshot.
// The booking details don't carry the file path, so it is looked up in the
// "review" list of payments (manual transfers waiting for a check), searched
// by this booking's code.
// Takes: the booking id and the pending payment.
// Gives back: { url } (undefined = no file) and saved = a file was uploaded.
async function screenshotFor(bookingId: string, payment: AdminBookingPayment): Promise<{ url: string | undefined; saved: boolean }> {
  if (!payment.has_screenshot) return { url: undefined, saved: false };
  const { rows } = await getAdminPayments({ view: "review", search: bookingReference(bookingId), limit: 20 });
  const path = rows.find((row) => row.payment_id === payment.id)?.screenshot_path;
  if (!path) return { url: undefined, saved: true };
  const links = await getScreenshotLinks([path]);
  return { url: links[path], saved: true };
}

// The classes this booking can be re-scheduled to: open, a free seat,
// before the online cutoff (is_bookable from get_open_sessions), not its own
// class, from today up to RESCHEDULE_DAYS_AHEAD days.
// Takes: the booking and "now" in milliseconds.
// Gives back: the choices for the "Move to" list, e.g.
// "Sat, Nov 21 · 10:15 – 11:05 AM · 3 seats left".
async function rescheduleOptions(booking: AdminBookingDetails, nowMs: number): Promise<SelectOption[]> {
  const today = manilaDateString(nowMs);
  const sessions = await getBookingSessions({ from: today, to: addDays(today, RESCHEDULE_DAYS_AHEAD) });
  return sessions
    .filter((session) => session.is_bookable && session.session_id !== booking.session_id)
    .map((session) => ({
      value: session.session_id,
      label: `${formatClassDate(session.date).short} · ${formatTimeRange(session.start_time, session.end_time)} · ${session.seats_left} seat${session.seats_left === 1 ? "" : "s"} left`,
    }));
}
