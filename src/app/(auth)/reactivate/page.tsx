// The "Welcome back! Reactivate your account?" page: /reactivate (Version 1.4)
// Where it's used: after logging in (email + password, or Google), a client
// who deactivated their OWN account is sent here instead of being logged out
// (src/lib/auth/actions.ts and src/app/auth/confirm/route.ts).
//
// The address can carry ?next=<page> (where they were going; only safe paths
// on our site count).
//
// Who sees what:
//   - not logged in:                       sent to /login
//   - account already active:              sent on to "next" (or Home)
//   - deactivated BY THE CAFE (no flag):   /auth/deactivated logs them out
//   - deactivated by themselves:           the question and the buttons
// The database checks all of this again (reactivate_my_account(), migration 17).

import { UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthPage } from "@/components/auth/AuthPage";
import { ReactivateForm } from "@/components/auth/ReactivateForm";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Welcome back" };

// The page.
// Takes: searchParams (?next=...).
// Gives back: the heading at once, and the live part inside <Suspense>
// (it reads the login cookies).
export default function ReactivatePage({ searchParams }: PageProps<"/reactivate">) {
  return (
    <AuthPage overline="Your account" title="Welcome back!">
      <Suspense fallback={<AuthFormSkeleton fields={0} />}>
        <ReactivateContent searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

// The live part: checks who is here, then asks the question.
// Takes: the searchParams promise.
// Gives back: the question and the buttons, or sends them elsewhere (see the
// list at the top of this file).
async function ReactivateContent({ searchParams }: Pick<PageProps<"/reactivate">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const user = await getCurrentUser();

  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (user.isActive) {
    redirect(next ?? "/");
  }
  if (!user.selfDeactivated) {
    // Turned off by the cafe: log out with the usual message
    redirect("/auth/deactivated");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-2xl bg-sage-light p-4">
        <UserRoundCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-ink">Reactivate your account?</p>
          <p className="text-muted">
            You deactivated your account. Turn it back on to book classes and see your bookings, payments and
            vouchers again.
          </p>
        </div>
      </div>
      <ReactivateForm next={next} />
    </div>
  );
}
