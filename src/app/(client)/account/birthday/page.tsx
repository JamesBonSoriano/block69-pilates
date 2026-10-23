// "Add your birthday": /account/birthday?next=<page>
// Where it's used: requireClient() (src/lib/auth/user.ts) sends a client here
// ONCE if their account has no birthday yet (accounts made before the
// sign-up form asked for it; Revisions part 1, item 7). After saving it they
// go on to the page they were opening ("next").
// New accounts give their birthday when they sign up, so they never see this.
//
// The database lets a client save their birthday only once (migration 12),
// so this page can't be used to change it later. Someone who already has one
// is sent straight on.

import { Cake } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoading } from "@/components/account/AccountHeading";
import { BirthdayForm } from "@/components/account/ProfileForms";
import { Card } from "@/components/ui/Card";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import { manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";

export const metadata = { title: "Add your birthday", robots: { index: false } };

// The page.
// Takes: searchParams (?next=<the page to go on to>).
// Gives back: the heading and the form (inside <Suspense>: it needs the login).
export default function BirthdayPage({ searchParams }: PageProps<"/account/birthday">) {
  return (
    <>
      <AccountHeading title="One more thing" intro="Please add your birthday to your account. We only ask once." />
      <Suspense fallback={<AccountLoading label="the form" cards={1} />}>
        <BirthdayContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part.
// Takes: the searchParams promise.
// Gives back: the form card, or sends people who already have a birthday on.
async function BirthdayContent({ searchParams }: Pick<PageProps<"/account/birthday">, "searchParams">) {
  const params = await searchParams;
  // Only a safe path on our site (and never this page again)
  const nextParam = safeNextPath(firstParam(params.next));
  const next = nextParam && !nextParam.startsWith("/account/birthday") ? nextParam : null;

  const user = await requireClient(`/account/birthday${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  // Already saved: nothing to do here
  if (user.birthday) {
    redirect(next ?? "/account/profile");
  }

  // Today in the Philippines: the latest date the picker allows
  const today = manilaDateString(nowForThisVisit());

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <span className="flex size-12 items-center justify-center rounded-full bg-tan-soft text-brown">
        <Cake aria-hidden="true" className="size-6" />
      </span>
      <p className="text-sm leading-relaxed text-muted">
        The cafe keeps your birthday with your booking details. You only need to add it once.
      </p>
      <BirthdayForm next={next} today={today} />
    </Card>
  );
}
