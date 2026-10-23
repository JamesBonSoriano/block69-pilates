// "Finish your profile": /account/finish-profile?next=<page>
// (Change 17. It replaces Revisions part 1's "Add your birthday" page.)
// Where it's used:
//   - right after a Google sign-in (src/app/auth/confirm/route.ts), because
//     Google gives us no mobile number or birthday
//   - requireClient() (src/lib/auth/user.ts) sends any client here whose
//     mobile number or birthday is missing, before booking or My Account.
//     Booking needs the mobile number so the cafe can reach them.
// It asks ONLY for what is missing (and the name, in the rare case it's
// empty). After saving they go on to the page they were opening ("next").
// Someone with nothing missing is sent straight on.

import { UserRoundCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoading } from "@/components/account/AccountHeading";
import { FinishProfileForm } from "@/components/account/ProfileForms";
import { Card } from "@/components/ui/Card";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { FINISH_PROFILE_PATH, needsFinishProfile, requireClient } from "@/lib/auth/user";

export const metadata = { title: "Finish your profile", robots: { index: false } };

// The page.
// Takes: searchParams (?next=<the page to go on to>).
// Gives back: the heading and the form (inside <Suspense>: it needs the login).
export default function FinishProfilePage({ searchParams }: PageProps<"/account/finish-profile">) {
  return (
    <>
      <AccountHeading
        title="Finish your profile"
        intro="Just a few details before you book, so the cafe can reach you."
      />
      <Suspense fallback={<AccountLoading label="the form" cards={1} />}>
        <FinishProfileContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part.
// Takes: the searchParams promise.
// Gives back: the form card, or sends people with nothing missing on.
async function FinishProfileContent({ searchParams }: Pick<PageProps<"/account/finish-profile">, "searchParams">) {
  const params = await searchParams;
  // Only a safe path on our site (and never this page again)
  const nextParam = safeNextPath(firstParam(params.next));
  const next = nextParam && !nextParam.startsWith(FINISH_PROFILE_PATH) ? nextParam : null;

  const user = await requireClient(`${FINISH_PROFILE_PATH}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  // Nothing missing: nothing to do here
  if (!needsFinishProfile(user) && user.fullName.trim()) {
    redirect(next ?? "/account/profile");
  }

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <span className="flex size-12 items-center justify-center rounded-full bg-tan-soft text-brown">
        <UserRoundCheck aria-hidden="true" className="size-6" />
      </span>
      <p className="text-sm leading-relaxed text-muted">
        Logged in as <span className="break-all font-semibold text-ink">{user.email}</span>. You can change
        these later in My Profile.
      </p>
      <FinishProfileForm
        next={next}
        missing={{
          fullName: !user.fullName.trim(),
          mobile: !user.mobile?.trim(),
          birthday: !user.birthday,
        }}
      />
    </Card>
  );
}
