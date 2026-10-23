// Notifications: /account/notifications
// Where it's used: the account menu, and the dot on the header's person icon.
// Two parts:
//   1. UPDATES (Revisions part 1, item 9): the client's own in-app updates,
//      newest first: booking confirmed, payment being checked / approved /
//      rejected, transfer done, cancelled with a 50% code, class cancelled by
//      the cafe, ... They come from the notifications table (migration 12),
//      which database triggers fill in. Opening this page marks them as read.
//   2. EMAILS (docs/designs/Notifications.html): the emails we send. Only the
//      day-before reminder can be switched off (CLAUDE.md section 4); it's
//      saved in profiles.email_reminders. Booking confirmations and class
//      changes are always sent. (The emails themselves come in Revisions
//      part 3. The reminder job will skip people who switched it off here.)
//
// ONLY YOUR OWN: requireClient() checks the login, and get_my_notifications()
// only ever gives back the caller's own rows.

import {
  Bell,
  CalendarClock,
  CalendarX,
  CircleAlert,
  CircleCheck,
  Clock,
  MailCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { MarkNotificationsRead } from "@/components/account/MarkNotificationsRead";
import { ReminderSwitch } from "@/components/account/ReminderSwitch";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireClient } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { getMyProfileExtras } from "@/lib/data/account";
import { getMyNotifications, type MyNotification } from "@/lib/data/notifications";
import { formatManilaDateTime } from "@/lib/format";
import { notificationText } from "@/lib/notifications";

export const metadata = { title: "Notifications" };

// The Notifications page.
// Takes: nothing.
// Gives back: the heading, the updates and the email choices, all inside
// <Suspense> (they need the login).
export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <>
          <AccountHeading title="Notifications" intro="Your booking updates, and the emails we send you." />
          <AccountLoading label="your notifications" cards={2} />
        </>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}

// The live part.
// Takes: nothing.
// Gives back: the heading, the list of updates, and the card of email choices.
async function NotificationsContent() {
  const user = await requireClient("/account/notifications");

  let emailReminders: boolean;
  let updates: MyNotification[];
  try {
    const [extras, list] = await Promise.all([getMyProfileExtras(user.id), getMyNotifications()]);
    emailReminders = extras.emailReminders;
    updates = list;
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <>
        <AccountHeading title="Notifications" />
        <AccountLoadError what="your notifications" />
      </>
    );
  }

  const hasUnread = updates.some((update) => !update.read_at);

  return (
    <>
      <AccountHeading title="Notifications" intro="Your booking updates, and the emails we send you." />

      {/* ===== Updates ===== */}
      <section aria-labelledby="updates-heading" className="flex flex-col gap-3">
        <h2 id="updates-heading" className="font-heading text-lg font-semibold text-brown">
          Updates
        </h2>
        {updates.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No updates yet. When you book, pay, move or cancel a class, it shows up here.
            </p>
          </Card>
        ) : (
          <Card className="py-1 lg:py-2">
            <ul>
              {updates.map((update) => (
                <UpdateRow key={update.id} update={update} />
              ))}
            </ul>
          </Card>
        )}
        {/* Saves them as read once they've been shown */}
        <MarkNotificationsRead hasUnread={hasUnread} />
      </section>

      {/* ===== Emails ===== */}
      <section aria-labelledby="emails-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="emails-heading" className="font-heading text-lg font-semibold text-brown">
            Emails
          </h2>
          <p className="text-sm text-muted">
            Sent to <span className="break-all font-semibold text-ink">{user.email}</span>.
          </p>
        </div>
        <Card className="py-1 lg:py-2">
          <ul>
            <Row
              icon={MailCheck}
              id="email-confirmations"
              title="Booking confirmations"
              text="Sent when your payment goes through or a booking changes."
              control={<Badge variant="success">Always on</Badge>}
            />
            <Row
              icon={CalendarClock}
              id="email-reminders"
              title="Day-before reminder"
              text="A reminder the day before your class, with what to bring."
              control={<ReminderSwitch initialValue={emailReminders} labelId="email-reminders" />}
            />
            <Row
              icon={CalendarX}
              id="email-class-changes"
              title="Class changes"
              text="If the cafe closes or cancels a class you booked."
              control={<Badge variant="success">Always on</Badge>}
            />
          </ul>
        </Card>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Bell aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Your choice is saved straight away. We only ever email you about your own bookings.
        </p>
      </section>
    </>
  );
}

// The icon and circle colors for each tone (status colors, CLAUDE.md section 7).
const TONE_STYLES: Record<BadgeVariant, { icon: LucideIcon; circle: string }> = {
  success: { icon: CircleCheck, circle: "bg-success-bg text-success" },
  info: { icon: Clock, circle: "bg-info-bg text-info" },
  warning: { icon: TriangleAlert, circle: "bg-warning-bg text-warning" },
  error: { icon: CircleAlert, circle: "bg-error-bg text-error" },
  neutral: { icon: Bell, circle: "bg-tan-soft text-brown" },
};

// One update in the list.
// Takes: the notification row.
// Gives back: an <li> with a colored icon, the title (and "New" if unread),
// the sentence, when it happened, and a link to the right page.
function UpdateRow({ update }: { update: MyNotification }) {
  const text = notificationText(update);
  const { icon: Icon, circle } = TONE_STYLES[text.tone];
  const isNew = !update.read_at;

  return (
    <li className="flex items-start gap-4 border-b border-line py-5 last:border-b-0">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", circle)}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {text.title}
          {isNew && <Badge variant="warning">New</Badge>}
        </p>
        <p className="text-sm leading-relaxed text-muted">{text.body}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <time dateTime={update.created_at}>{formatManilaDateTime(update.created_at)}</time>
          <Link
            href={text.href}
            className="inline-flex min-h-11 items-center font-semibold text-brown underline-offset-4 hover:underline"
          >
            {text.linkLabel}
          </Link>
        </p>
      </div>
    </li>
  );
}

// One kind of email (".row" in the mockup): an icon, a title, a short
// explanation, and on the right "Always on" or the switch.
// Takes: the icon, an id for the title (the switch uses it as its name),
// the title, the text, and the control on the right.
// Gives back: an <li>.
function Row({
  icon: Icon,
  id,
  title,
  text,
  control,
}: {
  icon: LucideIcon;
  id: string;
  title: string;
  text: string;
  control: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 border-b border-line py-5 last:border-b-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tan-soft text-brown">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p id={id} className="font-semibold">
          {title}
        </p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}
