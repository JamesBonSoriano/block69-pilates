// My Profile: /account/profile
// Where it's used: the person icon in the header ("My Account"), /account,
// the account menu, and "Edit in My Profile" on booking step 2.
// Layout follows docs/designs/Profile.html. Change 17, Part G: three cards
// under the round initials:
//   1. Account Information: the login email (Change email: current password,
//      then one 6-digit code sent to the new email), Change password, Forgot
//      password
//   2. Personal Information: full name, mobile number (09 + 11 digits),
//      Instagram (optional), birthday (editable again, a real past date),
//      each with a pen icon (Save / Cancel)
//   3. Account Management: Deactivate account, Delete account (both greyed
//      out while an upcoming class, a seat hold or a payment check blocks them)
// and a Log out button at the bottom (Version 1.4: it's no longer in the
// header or the phone menu).
//
// ?back=/book/details?session=...  (from booking step 2's "Edit in My
// Profile") shows a "Back to your booking" link at the top.
//
// ONLY YOUR OWN PROFILE: requireClient() reads the logged-in person, and the
// actions (src/lib/account/actions.ts) can only change their own row (Row
// Level Security). The database blocks direct email changes and checks the
// birthday (migration 16), and blocks role / active changes (migration 2).

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import {
  ChangePassword,
  DeactivateAccount,
  DeleteAccount,
  EmailChange,
} from "@/components/account/AccountSettingsForms";
import { ProfileField } from "@/components/account/ProfileForms";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Card } from "@/components/ui/Card";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import {
  getMyAccountInfo,
  getMyProfileExtras,
  type MyAccountInfo,
  type MyProfileExtras,
} from "@/lib/data/account";
import { initialsOf } from "@/lib/format";

export const metadata = { title: "My Profile" };

// The My Profile page.
// Takes: searchParams (?back=... from booking step 2).
// Gives back: the heading, then the live part inside <Suspense>.
export default function ProfilePage({ searchParams }: PageProps<"/account/profile">) {
  return (
    <>
      <AccountHeading title="My Profile" intro="Your details. We fill them in for you when you book." />
      <Suspense fallback={<AccountLoading label="your profile" cards={3} />}>
        <ProfileContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part: who you are, and the three cards.
// Takes: the searchParams promise.
// Gives back: the cards, filled in from the person's profile and login.
async function ProfileContent({ searchParams }: Pick<PageProps<"/account/profile">, "searchParams">) {
  const user = await requireClient("/account/profile");
  const params = await searchParams;
  // Only a safe path back into the booking steps counts
  const back = safeNextPath(firstParam(params.back));
  const backToBooking = back?.startsWith("/book") ? back : null;

  let extras: MyProfileExtras;
  let account: MyAccountInfo;
  try {
    [extras, account] = await Promise.all([getMyProfileExtras(user.id), getMyAccountInfo()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your profile" />;
  }

  // "October 2026"
  const memberSince = new Date(extras.memberSince).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5">
      {backToBooking && (
        <Link
          href={backToBooking}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-brown underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to your booking
        </Link>
      )}

      {/* Who you are: the round picture placeholder (initials) */}
      <Card className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-card bg-tan-soft font-heading text-[26px] font-semibold text-brown outline outline-1 outline-line"
        >
          {initialsOf(user.fullName, user.email)}
        </span>
        <div className="min-w-0">
          <p className="break-words font-heading text-xl font-semibold text-brown">{user.fullName || "No name yet"}</p>
          <p className="text-sm text-muted">Member since {memberSince}</p>
          {account.hasGoogle && <p className="text-xs text-muted">You can log in with Google.</p>}
        </div>
      </Card>

      {/* ===== 1. Account Information ===== */}
      <Card className="flex flex-col">
        <h2 className="font-heading text-lg font-semibold">Account Information</h2>
        <p className="text-sm text-muted">How you log in.</p>
        <div className="mt-2 flex flex-col">
          <EmailChange currentEmail={user.email} pendingEmail={account.pendingEmail} hasPassword={account.hasPassword} />
          <ChangePassword hasPassword={account.hasPassword} />
        </div>
      </Card>

      {/* ===== 2. Personal Information ===== */}
      <Card className="flex flex-col">
        <h2 className="font-heading text-lg font-semibold">Personal Information</h2>
        <p className="text-sm text-muted">Tap the pen to change a detail.</p>
        <div className="mt-2 flex flex-col">
          <ProfileField field="full_name" label="Full name" initialValue={user.fullName} autoComplete="name" maxLength={120} />
          <ProfileField
            field="mobile"
            label="Mobile number"
            initialValue={user.mobile ?? ""}
            type="tel"
            autoComplete="tel"
          />
          <ProfileField
            field="instagram"
            label="Instagram"
            initialValue={user.instagram ?? ""}
            optional
            placeholder="@yourname"
            maxLength={31}
          />
          <ProfileField field="birthday" label="Birthday" initialValue={extras.birthday ?? ""} />
        </div>
      </Card>

      {/* ===== 3. Account Management ===== */}
      <Card className="flex flex-col">
        <h2 className="font-heading text-lg font-semibold">Account Management</h2>
        <div className="mt-2 flex flex-col">
          <DeactivateAccount blockers={account.deletionBlockers} />
          <DeleteAccount blockers={account.deletionBlockers} hasPassword={account.hasPassword} />
        </div>
      </Card>

      {/* Log out (only this device), at the bottom of the page */}
      <LogoutButton fullWidth className="sm:w-auto" formClassName="flex sm:justify-end" />
    </div>
  );
}
