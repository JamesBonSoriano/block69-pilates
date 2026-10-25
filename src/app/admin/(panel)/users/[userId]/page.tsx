// Admin View user: /admin/users/<user id>
// Where it's used: the eye button and the name on the Users list.
// Version 1.4 (PDF page 26, Figma "User Management" view):
//   - a header card: initials, name, member since, active status, sessions
//     booked and total spent
//   - Member details: email, phone, Instagram, birthday, member since, status
//   - Booking & payment history: counts, last and next session, last
//     payment, mat rentals, and the most recent bookings (each opens its
//     booking details page)
// Buttons: Back, Edit and Communications.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin check (admin_get_user, admin_user_bookings).

import { MessageSquare, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminBackLink, AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage } from "@/components/admin/AdminUi";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/user";
import { adminBookingStatusBadge } from "@/lib/booking-rules";
import { getAdminUserBookings, getAdminUserDetails } from "@/lib/data/admin-users";
import { formatBirthdayLong, formatClassDate, formatManilaDate, formatPeso, formatTime, initialsOf } from "@/lib/format";
import type { AdminUserBooking, AdminUserDetails } from "@/types/app";

export const metadata: Metadata = { title: "View user · Admin" };

// How many recent bookings to list.
const RECENT = 6;

// The View user page.
// Takes: params (the user id from the address).
// Gives back: the Back link, then the live part in <Suspense>.
export default function AdminViewUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  return (
    <AdminPage>
      <AdminBackLink href="/admin/users" label="All users" />
      <Suspense fallback={<AdminLoading label="the account" />}>
        <UserBody params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the three cards.
// Takes: the params promise. Gives back: the cards, or "page not found".
async function UserBody({ params }: { params: PageProps<"/admin/users/[userId]">["params"] }) {
  await requireAdmin();
  const { userId } = await params;

  let user: AdminUserDetails | null;
  let bookings: AdminUserBooking[];
  try {
    [user, bookings] = await Promise.all([getAdminUserDetails(userId), getAdminUserBookings(userId, RECENT)]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="this account" />;
  }
  if (!user) notFound();

  const name = user.full_name ?? user.email ?? "Deleted account";
  const isClient = user.role === "client" && !user.is_deleted;

  return (
    <>
      {/* ---- Header card ---- */}
      <AdminCard className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-admin-bg font-heading text-lg font-semibold text-brown"
          >
            {initialsOf(user.full_name ?? "", user.email ?? "")}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-[22px] font-semibold leading-tight lg:text-[26px]">{name}</h1>
            <p className="text-xs text-muted">Member since {formatManilaDate(user.created_at)}</p>
            <div className="flex flex-wrap gap-1.5">
              <AccountBadge user={user} />
              {user.role === "admin" && <Badge variant="neutral">Admin</Badge>}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:text-right">
          <div>
            <dt>
              <AdminOverline as="span">Sessions booked</AdminOverline>
            </dt>
            <dd className="font-heading text-2xl font-semibold text-brown">{user.sessions_booked}</dd>
          </div>
          <div>
            <dt>
              <AdminOverline as="span">Total spent</AdminOverline>
            </dt>
            <dd className="font-heading text-2xl font-semibold text-brown">{formatPeso(Number(user.total_spent))}</dd>
          </div>
        </dl>
      </AdminCard>

      {isClient && (
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href={`/admin/users/${user.user_id}/edit`} variant="secondary">
            <Pencil aria-hidden="true" className="size-4" />
            Edit details
          </ButtonLink>
          <ButtonLink href={`/admin/users/${user.user_id}/communications`} variant="secondary">
            <MessageSquare aria-hidden="true" className="size-4" />
            Communications
          </ButtonLink>
        </div>
      )}

      {/* ---- Member details ---- */}
      <AdminCard className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Member details</h2>
          <p className="text-xs text-muted">Profile and contact information.</p>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Email">{user.email ?? "—"}</Detail>
          <Detail label="Phone">{user.mobile ?? "—"}</Detail>
          <Detail label="Instagram">{user.instagram ? `@${user.instagram}` : "—"}</Detail>
          <Detail label="Birthday">{user.birthday ? formatBirthdayLong(user.birthday) : "—"}</Detail>
          <Detail label="Member since">{formatManilaDate(user.created_at)}</Detail>
          <Detail label="Account">
            <AccountBadge user={user} />
          </Detail>
        </dl>
      </AdminCard>

      {/* ---- Booking & payment history ---- */}
      <AdminCard className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Booking &amp; payment history</h2>
          <p className="text-xs text-muted">Sessions and payments for this member.</p>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Detail label="Last session">{classLabel(user.last_class_date, user.last_class_time) ?? "None yet"}</Detail>
          <Detail label="Next session">{classLabel(user.next_class_date, user.next_class_time) ?? "None booked"}</Detail>
          <Detail label="Last payment">
            {user.last_payment_amount !== null && user.last_payment_at
              ? `${formatPeso(Number(user.last_payment_amount))} · ${formatManilaDate(user.last_payment_at)}`
              : "None yet"}
          </Detail>
        </dl>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Sessions">{user.sessions_booked}</Tile>
          <Tile label="Attended">{user.sessions_attended}</Tile>
          <Tile label="Payments">{user.payments_count}</Tile>
          <Tile label="Mat rentals">{user.mat_rentals}</Tile>
          <Tile label="Total spent">{formatPeso(Number(user.total_spent))}</Tile>
        </dl>

        <div className="flex flex-col gap-2.5">
          <AdminOverline as="h3">Recent bookings</AdminOverline>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted">No bookings yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {bookings.map((booking) => {
                const badge = adminBookingStatusBadge(booking.status);
                const paid = Number(booking.paid_amount);
                return (
                  <li key={booking.booking_id}>
                    <Link
                      href={`/admin/bookings/${booking.booking_id}`}
                      className="flex flex-col gap-1.5 rounded-xl border border-admin-line px-3.5 py-3 hover:bg-admin-bg/50 focus-visible:outline-2 focus-visible:outline-brown"
                    >
                      <span className="text-[13px] font-semibold">
                        {formatClassDate(booking.date).short} · {formatTime(booking.start_time)}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {paid > 0 ? `${formatPeso(paid)} paid` : "Not paid"}
                        {booking.mat_rental && " · Mat"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {user.email && user.sessions_booked > RECENT && (
            <Link
              href={`/admin/bookings?q=${encodeURIComponent(user.email)}`}
              className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-brown underline underline-offset-2"
            >
              See all bookings
            </Link>
          )}
        </div>
      </AdminCard>
    </>
  );
}

// The Active / Deactivated / Deleted badge.
// Takes: the account. Gives back: one badge.
function AccountBadge({ user }: { user: AdminUserDetails }) {
  if (user.is_deleted) return <Badge variant="neutral">Deleted</Badge>;
  return user.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="error">Deactivated</Badge>;
}

// One label + value pair in a details list.
// Takes: the label and the value. Gives back: a <div> with <dt> and <dd>.
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt>
        <AdminOverline as="span">{label}</AdminOverline>
      </dt>
      <dd className="break-words text-sm font-semibold">{children}</dd>
    </div>
  );
}

// One small number tile (Sessions, Payments, ...).
// Takes: the label and the number. Gives back: a soft panel.
function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-admin-bg/70 px-3.5 py-3">
      <dt>
        <AdminOverline as="span">{label}</AdminOverline>
      </dt>
      <dd className="font-heading text-xl font-semibold text-brown">{children}</dd>
    </div>
  );
}

// "Thu, Oct 29 · 9:00 AM" for a class, or null when there's none.
// Takes: the class date and start time (either can be null).
// Gives back: the words, or null.
function classLabel(date: string | null, time: string | null): string | null {
  if (!date) return null;
  return time ? `${formatClassDate(date).short} · ${formatTime(time)}` : formatClassDate(date).short;
}
