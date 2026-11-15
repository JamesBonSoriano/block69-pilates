// The two icon buttons in the "Action" column of the admin Appointments list
// (Version 1.6), also on the phone cards:
//   eye     View: the read-only booking page with "Download PDF"
//           (/admin/appointments/<id>)
//   pencil  Manage: confirm or reject a payment, cancel, re-schedule,
//           attendance (/admin/appointments/<id>/manage)
// Where it's used: src/components/admin/AdminBookingList.tsx.
//
// They are real links (<a>) with an aria-label for screen readers and a small
// tooltip that shows on hover and on keyboard focus. Each is 44px on phones
// (easy to tap) and 36px in the laptop table.

import { Eye, Pencil, type LucideIcon } from "lucide-react";
import Link from "next/link";

// The two buttons for one appointment.
// Takes: the booking id and the guest's name (for the screen reader labels).
// Gives back: the eye and pencil links side by side.
export function AppointmentActionLinks({ bookingId, guestName }: { bookingId: string; guestName: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconLink
        href={`/admin/appointments/${bookingId}`}
        icon={Eye}
        tooltip="View"
        label={`View ${guestName}'s appointment`}
      />
      <IconLink
        href={`/admin/appointments/${bookingId}/manage`}
        icon={Pencil}
        tooltip="Manage"
        label={`Manage ${guestName}'s appointment`}
      />
    </div>
  );
}

// One round icon link with a tooltip.
// Takes: where it goes, the icon, the short tooltip text and the full label.
// Gives back: the link.
function IconLink({ href, icon: Icon, tooltip, label }: { href: string; icon: LucideIcon; tooltip: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-admin-line bg-white text-brown transition-colors hover:bg-admin-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown lg:size-9"
    >
      <Icon aria-hidden="true" className="size-4" />
      {/* The tooltip: hidden from screen readers (they hear the aria-label) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {tooltip}
      </span>
    </Link>
  );
}
