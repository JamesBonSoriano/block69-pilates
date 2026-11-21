// The list of appointments on the admin Appointments page:
//   - laptop: a table (docs/designs/AdminBookings.html)
//   - phone:  one card per appointment (docs/designs/PhoneAdminBookings.html)
// Version 1.6: the Status column shows one of the five simple words
// (Pending, Confirmed, Done, Cancelled, Re-scheduled), and the "Action"
// column has two icon buttons: eye = view (+ PDF), pencil = manage. The
// phone cards have the same two buttons.
// Where it's used: src/app/admin/(panel)/appointments/page.tsx.

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { appointmentStatus } from "@/lib/admin/display";
import { bookingReference, paymentMethodName } from "@/lib/booking-rules";
import { formatClassDate, formatManilaDateTime, formatPeso, formatTime, initialsOf } from "@/lib/format";
import type { AdminBookingListItem } from "@/types/app";
import { AdminCard } from "./AdminUi";
import { AppointmentActionLinks } from "./AppointmentActionLinks";

// The appointment list.
// Takes: the appointments to show (already filtered by the database).
// Gives back: the table (laptop) and the cards (phone). Only one of them is
// visible at a time; screen readers also only get the visible one.
export function AdminBookingList({ bookings }: { bookings: AdminBookingListItem[] }) {
  if (bookings.length === 0) {
    return <AdminCard className="text-sm text-muted">No appointments match these filters.</AdminCard>;
  }

  return (
    <>
      {/* ===== Laptop: table ===== */}
      <AdminCard className="hidden overflow-x-auto p-0 lg:block">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">Appointments</caption>
          <thead>
            <tr className="border-b border-admin-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Client</th>
              <th scope="col" className="px-4 py-3 font-semibold">Class</th>
              <th scope="col" className="px-4 py-3 font-semibold">Booked at</th>
              <th scope="col" className="px-4 py-3 font-semibold">Drink</th>
              <th scope="col" className="px-4 py-3 font-semibold">Mat</th>
              <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const status = appointmentStatus(booking.status, { attendanceDue: booking.attendance_due });
              return (
                <tr key={booking.booking_id} className="border-b border-admin-bg last:border-b-0 hover:bg-admin-bg/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin-bg text-[11px] font-semibold text-brown"
                      >
                        {initialsOf(booking.guest_name, booking.guest_email ?? "")}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/appointments/${booking.booking_id}`}
                          className="font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          {booking.guest_name}
                        </Link>
                        <p className="text-[11px] text-muted">{refLine(booking)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {formatClassDate(booking.class_date).short}
                    <span className="block text-[11px] text-muted">{formatTime(booking.start_time)}</span>
                  </td>
                  <td className="px-4 py-3">{formatManilaDateTime(booking.created_at)}</td>
                  <td className="px-4 py-3">{booking.drink_choice ?? "At the cafe"}</td>
                  <td className="px-4 py-3">{booking.mat_rental ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{paymentLine(booking)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentActionLinks bookingId={booking.booking_id} guestName={booking.guest_name} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminCard>

      {/* ===== Phone: cards ===== */}
      <ul className="flex flex-col gap-2.5 lg:hidden">
        {bookings.map((booking) => {
          const status = appointmentStatus(booking.status, { attendanceDue: booking.attendance_due });
          return (
            <li
              key={booking.booking_id}
              className="flex flex-col gap-1.5 rounded-2xl border border-admin-line bg-white p-3.5"
            >
              <span className="flex items-start justify-between gap-2.5">
                <Link
                  href={`/admin/appointments/${booking.booking_id}`}
                  className="min-w-0 break-words text-sm font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {booking.guest_name}
                </Link>
                <Badge variant={status.variant}>{status.label}</Badge>
              </span>
              <span className="text-xs text-muted">
                {formatClassDate(booking.class_date).short} · {formatTime(booking.start_time)} ·{" "}
                {booking.drink_choice ?? "Drink at cafe"} · {booking.mat_rental ? "Mat" : "Own mat"}
              </span>
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 text-muted">{refLine(booking)}</span>
                <span className="shrink-0 font-semibold text-ink">{paymentLine(booking)}</span>
              </span>
              <span className="text-xs text-muted">Booked at {formatManilaDateTime(booking.created_at)}</span>
              {/* The same two buttons as the table's Action column */}
              <div className="flex justify-end border-t border-admin-bg pt-2">
                <AppointmentActionLinks bookingId={booking.booking_id} guestName={booking.guest_name} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// The small line under a client's name: booking number and notes.
// Takes: one booking. Gives back: e.g. "B69-3F9A1C2D · walk-in · first time".
function refLine(booking: AdminBookingListItem): string {
  const parts = [bookingReference(booking.booking_id)];
  if (booking.is_walkin) parts.push("walk-in");
  if (booking.moved_here) parts.push("moved here");
  if (booking.first_time) parts.push("first time");
  if (booking.has_health_notes) parts.push("health note");
  return parts.join(" · ");
}

// The payment shown for one booking.
// Takes: one booking. Gives back: e.g. "₱550 · GCash", or "₱550 · not paid".
function paymentLine(booking: AdminBookingListItem): string {
  if (booking.paid_amount !== null && booking.paid_provider) {
    return `${formatPeso(Number(booking.paid_amount))} · ${paymentMethodName(booking.paid_method, booking.paid_provider)}`;
  }
  return `${formatPeso(Number(booking.total))} · not paid`;
}
