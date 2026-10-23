// Notifications: /account/notifications
// Where it's used: the account menu.
// Layout follows docs/designs/Notifications.html: the emails we send, each
// with a short explanation. Only the day-before reminder can be switched off
// (CLAUDE.md section 4: "email reminder on or off"); it's saved in
// profiles.email_reminders. Booking confirmations and class changes are
// always sent, because people need them.
// (The emails themselves are built in Step 13. The reminder job will skip
// people who switched it off here.)

import { Bell, CalendarClock, CalendarX, MailCheck, type LucideIcon } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { ReminderSwitch } from "@/components/account/ReminderSwitch";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireClient } from "@/lib/auth/user";
import { getMyProfileExtras } from "@/lib/data/account";

export const metadata = { title: "Notifications" };

// The Notifications page.
// Takes: nothing.
// Gives back: the heading and the live list inside <Suspense> (it needs the
// login to know the email address and the saved choice).
export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <>
          <AccountHeading title="Notifications" intro="Choose which emails we send you." />
          <AccountLoading label="your email choices" cards={1} />
        </>
      }
    >
      <NotificationSettings />
    </Suspense>
  );
}

// The live part: the heading with their email, and the list of emails.
// Takes: nothing.
// Gives back: the heading and a card with one row per kind of email.
async function NotificationSettings() {
  const user = await requireClient("/account/notifications");

  let emailReminders: boolean;
  try {
    ({ emailReminders } = await getMyProfileExtras(user.id));
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return (
      <>
        <AccountHeading title="Notifications" />
        <AccountLoadError what="your email choices" />
      </>
    );
  }

  return (
    <>
      <AccountHeading
        title="Notifications"
        intro={
          <>
            Choose which emails we send to <span className="break-all font-semibold text-ink">{user.email}</span>.
          </>
        }
      />
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
    </>
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
