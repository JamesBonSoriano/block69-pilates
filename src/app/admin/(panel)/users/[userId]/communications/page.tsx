// Admin Communications for one client: /admin/users/<user id>/communications
// Where it's used: the speech-bubble button on the Users list, and the
// "Communications" buttons on View user and Edit user.
// Version 1.4 (docs/Revisions/image.png), three cards:
//   1. Compose message: a subject and message, emailed to this client
//      (sendUserMessage)
//   2. Resend booking confirmation: pick one of their upcoming confirmed
//      bookings (resendConfirmation)
//   3. Communications history: every email sent to them, newest first,
//      10 per page; open one to read the whole message
// Emails go out through Gmail SMTP (src/lib/email.ts). If the SMTP keys
// aren't set yet, a note says so and nothing is sent. A failed email never
// breaks the page: the admin sees a plain message and the history says "Failed".
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks (the log can only be read by admins).

import { ChevronDown, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminBackLink, AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { resendConfirmation, sendUserMessage } from "@/lib/admin/user-actions";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { getAdminUserBookings, getAdminUserDetails, getUserMessages } from "@/lib/data/admin-users";
import { emailIsSetUp } from "@/lib/email";
import { formatClassDate, formatManilaDateTime, formatTimeRange } from "@/lib/format";
import type { AdminUserBooking, AdminUserDetails, CommunicationRow } from "@/types/app";

export const metadata: Metadata = { title: "Communications · Admin" };

// Messages per page in the history.
const PER_PAGE = 10;

// The badge for each kind of email.
const KIND_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  message: { label: "Message", variant: "neutral" },
  confirmation: { label: "Booking confirmation", variant: "info" },
};

// The badge for each sending status.
const STATUS_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  sending: { label: "Sending", variant: "warning" },
};

// The Communications page.
// Takes: params (the user id) and searchParams (page = history page).
// Gives back: the live part in <Suspense>.
export default function AdminCommunicationsPage({ params, searchParams }: PageProps<"/admin/users/[userId]/communications">) {
  return (
    <AdminPage>
      <Suspense fallback={<AdminLoading label="the messages" />}>
        <CommunicationsBody params={params} searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the heading and the three cards.
// Takes: the params and searchParams promises.
// Gives back: the cards, or "page not found" for an unknown account.
async function CommunicationsBody({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/users/[userId]/communications">["params"];
  searchParams: PageProps<"/admin/users/[userId]/communications">["searchParams"];
}) {
  await requireAdmin();
  const { userId } = await params;
  const pageParam = Number(firstParam((await searchParams).page));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;

  let user: AdminUserDetails | null;
  let bookings: AdminUserBooking[];
  let history: { rows: CommunicationRow[]; total: number };
  try {
    [user, bookings, history] = await Promise.all([
      getAdminUserDetails(userId),
      getAdminUserBookings(userId, 50),
      getUserMessages(userId, page, PER_PAGE),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the messages" />;
  }
  if (!user) notFound();

  const name = user.full_name ?? user.email ?? "Deleted account";
  const canSend = user.role === "client" && !user.is_deleted && Boolean(user.email);
  const setUp = emailIsSetUp();
  // Bookings with a confirmation to send: confirmed, class not over yet
  const confirmable = bookings.filter((booking) => booking.status === "confirmed" && !booking.class_ended);
  const base = `/admin/users/${user.user_id}/communications`;

  return (
    <>
      <AdminBackLink href={`/admin/users/${user.user_id}`} label="Back to the account" />
      <AdminPageHeader
        overline={name}
        title="Communications"
        intro="Send this client an email, and see every email sent to them."
      />

      {!setUp && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            Email sending isn&apos;t set up yet, so nothing can be sent. Add the SMTP keys (SMTP_HOST, SMTP_PORT,
            SMTP_USER, SMTP_PASS, EMAIL_FROM) to .env.local and restart the website.
          </p>
        </div>
      )}

      {canSend ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          {/* ---- 1. Compose message ---- */}
          <AdminCard className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold">Compose message</h2>
              <p className="text-xs text-muted">A plain email. The cafe&apos;s name, address and email are added at the end.</p>
            </div>
            <AdminActionForm action={sendUserMessage} submitLabel="Send message" pendingLabel="Sending…" resetOnSave>
              <input type="hidden" name="user_id" value={user.user_id} />
              <Input label="To" name="to_shown" defaultValue={user.email ?? ""} disabled />
              <Input label="Subject" name="subject" required maxLength={150} autoComplete="off" />
              <Textarea label="Message" name="message" required rows={8} maxLength={4000} hint="Up to 4000 characters." />
            </AdminActionForm>
          </AdminCard>

          {/* ---- 2. Resend booking confirmation ---- */}
          <AdminCard className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold">Resend booking confirmation</h2>
              <p className="text-xs text-muted">Sends the booking details again (date, time, drink, mat, total).</p>
            </div>
            {confirmable.length === 0 ? (
              <p className="text-sm text-muted">No upcoming confirmed bookings.</p>
            ) : (
              <AdminActionForm action={resendConfirmation} submitLabel="Resend confirmation" pendingLabel="Sending…">
                <input type="hidden" name="user_id" value={user.user_id} />
                <Select
                  label="Booking"
                  name="booking_id"
                  required
                  options={confirmable.map((booking) => ({
                    value: booking.booking_id,
                    label: `${formatClassDate(booking.date).short} · ${formatTimeRange(booking.start_time, booking.end_time)}`,
                  }))}
                />
              </AdminActionForm>
            )}
          </AdminCard>
        </div>
      ) : (
        <AdminCard className="text-sm text-muted">
          {user.role === "admin" ? "Messages can only be sent to client accounts." : "This account has no email address any more."}
        </AdminCard>
      )}

      {/* ---- 3. History ---- */}
      <AdminCard className="flex flex-col p-0 lg:p-0">
        <div className="p-4 lg:p-6">
          <h2 className="text-base font-semibold">Communications history</h2>
          <p className="text-xs text-muted">Newest first. Open one to read the whole email.</p>
        </div>
        {history.rows.length === 0 ? (
          <p className="border-t border-admin-line px-4 py-5 text-sm text-muted lg:px-6">No emails sent yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-admin-bg border-t border-admin-line">
            {history.rows.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </ul>
        )}
        <div className="border-t border-admin-line">
          <AdminPagination
            page={page}
            perPage={PER_PAGE}
            total={history.total}
            noun={history.total === 1 ? "email" : "emails"}
            label="History pages"
            hrefFor={(n) => (n === 1 ? base : `${base}?page=${n}`)}
          />
        </div>
      </AdminCard>
    </>
  );
}

// One email in the history: a summary line that opens to show the whole
// message (a <details> box, so it works without JavaScript).
// Takes: the logged email. Gives back: an <li>.
function MessageRow({ message }: { message: CommunicationRow }) {
  const kind = KIND_BADGES[message.kind] ?? KIND_BADGES.message;
  const status = STATUS_BADGES[message.status] ?? STATUS_BADGES.sending;

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-2 px-4 py-3 hover:bg-admin-bg/40 sm:flex-row sm:items-center sm:gap-4 lg:px-6 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-xs text-muted sm:w-40">{formatManilaDateTime(message.created_at)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{message.subject}</span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant={kind.variant}>{kind.label}</Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
            <ChevronDown aria-hidden="true" className="size-4 text-brown transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="flex flex-col gap-3 bg-admin-bg/40 px-4 py-4 lg:px-6">
          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt>
                <AdminOverline as="span">To</AdminOverline>
              </dt>
              <dd className="break-all font-semibold">{message.to_email}</dd>
            </div>
            <div>
              <dt>
                <AdminOverline as="span">Subject</AdminOverline>
              </dt>
              <dd className="font-semibold">{message.subject}</dd>
            </div>
          </dl>
          {message.status === "failed" && message.error && (
            <p className="text-xs font-semibold text-error">Not sent: {message.error}</p>
          )}
          {/* whitespace-pre-wrap keeps the message's own line breaks */}
          <p className="whitespace-pre-wrap break-words rounded-xl border border-admin-line bg-white p-4 text-[13px] leading-relaxed">
            {message.body}
          </p>
        </div>
      </details>
    </li>
  );
}
