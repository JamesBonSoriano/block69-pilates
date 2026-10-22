// My Profile: /account/profile
// Where it's used: the account menu.
// Layout follows docs/designs/Profile.html: who you are (initials, name,
// member since), your personal details, password, and deactivate account.
//
// ONLY YOUR OWN PROFILE: requireUser() reads the logged-in person, and the
// save actions (src/lib/account/actions.ts) can only change their own row
// (Row Level Security, migration 2). Role and "active" can't be changed here
// (a database trigger blocks it); deactivating uses deactivate_my_account().

import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { DeactivateForm, DetailsForm, PasswordForm } from "@/components/account/ProfileForms";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/user";
import { getMyBookings, getMyProfileExtras, type MyProfileExtras } from "@/lib/data/account";
import { initialsOf } from "@/lib/format";

export const metadata = { title: "My Profile" };

// The My Profile page.
// Takes: nothing.
// Gives back: the heading, then the live part inside <Suspense>.
export default function ProfilePage() {
  return (
    <>
      <AccountHeading title="My Profile" intro="Keep your details up to date. We fill them in for you when you book." />
      <Suspense fallback={<AccountLoading label="your profile" cards={3} />}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

// The live part: the four cards.
// Takes: nothing.
// Gives back: the cards, filled in from the person's profile.
async function ProfileContent() {
  const user = await requireUser("/account/profile");

  let extras: MyProfileExtras;
  let upcomingCount: number;
  try {
    const [profileExtras, bookings] = await Promise.all([getMyProfileExtras(user.id), getMyBookings()]);
    extras = profileExtras;
    // For the deactivate warning: bookings still holding a seat
    upcomingCount = bookings.filter((booking) => booking.is_upcoming).length;
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
      {/* Who you are */}
      <Card className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-tan-soft font-heading text-[22px] font-semibold text-brown"
        >
          {initialsOf(user.fullName, user.email)}
        </span>
        <div className="min-w-0">
          <p className="font-heading text-xl font-semibold text-brown">{user.fullName || "No name yet"}</p>
          <p className="text-sm text-muted">Member since {memberSince}</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-brown">Personal information</h2>
        <DetailsForm
          initial={{
            fullName: user.fullName,
            email: user.email,
            mobile: user.mobile ?? "",
            // Saved without the "@"; shown with it, like on booking step 2
            instagram: user.instagram ? `@${user.instagram}` : "",
            birthday: extras.birthday ?? "",
          }}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brown">Password</h2>
          <p className="text-sm text-muted">You&apos;ll need your current password to set a new one.</p>
        </div>
        <PasswordForm />
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-error">Deactivate account</h2>
          <p className="text-sm text-muted">
            You can&apos;t log in or book while deactivated. Ask the cafe to reactivate it anytime.
          </p>
        </div>
        <DeactivateForm upcomingCount={upcomingCount} />
      </Card>
    </div>
  );
}
