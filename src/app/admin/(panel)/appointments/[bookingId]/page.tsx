// One appointment, READ-ONLY, for the admin: /admin/appointments/<booking id>
// (the eye button; Version 1.6. /admin/bookings/<id> redirects here.)
// Where it's used: the eye icon and the guest names on the Appointments list,
// the Dashboard, a user's page, and the History links between moved bookings.
// No mockup for this page: it follows the admin card style.
//
// What it shows: the status (the simple word, with the exact reason under
// it, e.g. "Cancelled · No-show"), the class, the guest, drink / mat / money,
// every payment (including the original booking's after a move), and a short
// history with the admin's reasons.
// Buttons: "Download PDF" (these details as a PDF, .../pdf), "View receipt"
// (only once something was paid) and "Manage" (the pencil page, where the
// admin confirms / rejects payments, cancels, re-schedules and marks
// attendance). Nothing can be changed on this page itself.
// Version 1.6: no "Cancel class" button any more (only on Schedule).
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check (admin_get_booking, migration 9).

import { ArrowLeft, Pencil, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import {
  AppointmentNotices,
  ClassDetailsCard,
  GuestDetailsCard,
  HistoryCard,
  OrderDetailsCard,
  PaymentsDetailsCard,
  StatusLine,
} from "@/components/admin/AppointmentDetails";
import { DownloadReceiptButton } from "@/components/receipt/DownloadReceiptButton";
import { ButtonLink } from "@/components/ui/Button";
import { bookingDetailsStatus } from "@/lib/admin/appointment-status";
import { requireAdmin } from "@/lib/auth/user";
import { bookingReference } from "@/lib/booking-rules";
import { getAdminBooking } from "@/lib/data/admin";
import { getBookingChangeInfo } from "@/lib/data/admin-setup";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminBookingChangeInfo, AdminBookingDetails } from "@/types/app";

export const metadata: Metadata = { title: "Appointment · Admin" };

// The view page.
// Takes: params (the booking id from the address).
// Gives back: a back link, then the live details inside <Suspense>.
export default function AdminAppointmentPage({ params }: PageProps<"/admin/appointments/[bookingId]">) {
  return (
    <AdminPage>
      <Link
        href="/admin/appointments"
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-sm font-semibold text-brown hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All appointments
      </Link>
      <Suspense fallback={<AdminLoading label="the appointment" />}>
        <AppointmentView params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: everything about the appointment.
// Takes: the params promise.
// Gives back: the heading and the cards, or the "page not found" page if
// the booking doesn't exist.
async function AppointmentView({ params }: { params: PageProps<"/admin/appointments/[bookingId]">["params"] }) {
  await requireAdmin();
  const { bookingId } = await params;

  // Read the clock once (a real visit: requireAdmin has run)
  const nowMs = nowForThisVisit();

  let booking: AdminBookingDetails | null;
  let change: AdminBookingChangeInfo | null;
  try {
    // The booking, and the admin actions for its History
    [booking, change] = await Promise.all([getAdminBooking(bookingId), getBookingChangeInfo(bookingId)]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this appointment" />;
  }
  if (!booking) notFound();

  const status = bookingDetailsStatus(booking, nowMs);
  const manageHref = `/admin/appointments/${booking.booking_id}/manage`;
  // A receipt exists only once money was received
  const hasPaidPayment = booking.payments.some((pay) => pay.status === "paid");

  return (
    <>
      <AdminPageHeader
        overline={bookingReference(booking.booking_id)}
        title={booking.guest_name}
        intro={
          <span className="flex flex-col gap-1.5">
            <StatusLine label={status.label} variant={status.variant} reason={status.reason} />
            <span>{booking.is_walkin ? "Walk-in booking" : "Online booking"}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <DownloadReceiptButton href={`/admin/appointments/${booking.booking_id}/pdf`} label="Download PDF" />
            {hasPaidPayment && (
              <ButtonLink href={`/admin/receipt/${booking.booking_id}`} variant="secondary">
                <ReceiptText aria-hidden="true" className="size-4" />
                View receipt
              </ButtonLink>
            )}
            <ButtonLink href={manageHref} variant="secondary">
              <Pencil aria-hidden="true" className="size-4" />
              Manage
            </ButtonLink>
          </div>
        }
      />

      <AppointmentNotices booking={booking} manageHref={manageHref} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <ClassDetailsCard booking={booking} />
          <GuestDetailsCard booking={booking} />
        </div>
        <div className="flex flex-col gap-5">
          <OrderDetailsCard booking={booking} />
          <PaymentsDetailsCard booking={booking} />
          <HistoryCard booking={booking} actions={change?.actions ?? []} />
        </div>
      </div>
    </>
  );
}
