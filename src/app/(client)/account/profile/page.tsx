// My Profile: /account/profile
// Where it's used: the person icon in the header ("My Account"), /account,
// the account menu, and "Edit in My Profile" on booking step 2.
// Layout follows docs/designs/Profile.html, changed by Revisions part 1, item 7:
//   - a round profile picture placeholder (the initials; no upload)
//   - only name, mobile number and Instagram can be edited, each with a pen
//     icon that opens an input with Save and Cancel
//   - email is read-only ("To change your email, message the cafe")
//   - birthday is read-only (it's asked once, on /account/birthday)
//   - no Change password and no Deactivate my account (Forgot password on
//     the login page still works; the deactivate database function is kept)
//
// ?back=/book/details?session=...  (from booking step 2's "Edit in My
// Profile") shows a "Back to your booking" link at the top.
//
// ONLY YOUR OWN PROFILE: requireClient() reads the logged-in person, and the
// save action (src/lib/account/actions.ts) can only change their own row
// (Row Level Security). The database also blocks email and birthday changes
// (migration 12) and role / active changes (migration 2).

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { ProfileField } from "@/components/account/ProfileForms";
import { Card } from "@/components/ui/Card";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { requireClient } from "@/lib/auth/user";
import { getMyProfileExtras, type MyProfileExtras } from "@/lib/data/account";
import { initialsOf } from "@/lib/format";

export const metadata = { title: "My Profile" };

// The My Profile page.
// Takes: searchParams (?back=... from booking step 2).
// Gives back: the heading, then the live part inside <Suspense>.
export default function ProfilePage({ searchParams }: PageProps<"/account/profile">) {
  return (
    <>
      <AccountHeading title="My Profile" intro="Your details. We fill them in for you when you book." />
      <Suspense fallback={<AccountLoading label="your profile" cards={2} />}>
        <ProfileContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// The live part: who you are, and your details.
// Takes: the searchParams promise.
// Gives back: the cards, filled in from the person's profile.
async function ProfileContent({ searchParams }: Pick<PageProps<"/account/profile">, "searchParams">) {
  const user = await requireClient("/account/profile");
  const params = await searchParams;
  // Only a safe path back into the booking steps counts
  const back = safeNextPath(firstParam(params.back));
  const backToBooking = back?.startsWith("/book") ? back : null;

  let extras: MyProfileExtras;
  try {
    extras = await getMyProfileExtras(user.id);
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
  // "January 15, 2000"
  const birthday = user.birthday ? formatBirthday(user.birthday) : null;

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
        </div>
      </Card>

      {/* Your details: three you can edit, two you can't */}
      <Card className="flex flex-col">
        <h2 className="font-heading text-lg font-semibold text-brown">Personal information</h2>
        <p className="text-sm text-muted">Tap the pen to change a detail.</p>
        <div className="mt-2 flex flex-col">
          <ProfileField field="full_name" label="Full name" initialValue={user.fullName} autoComplete="name" maxLength={120} />
          <ProfileField
            field="mobile"
            label="Mobile number"
            initialValue={user.mobile ?? ""}
            type="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
          />
          <ProfileField
            field="instagram"
            label="Instagram"
            initialValue={user.instagram ?? ""}
            optional
            placeholder="@yourname"
            maxLength={31}
          />
          <ReadOnlyRow label="Email" value={user.email} note="To change your email, message the cafe." />
          <ReadOnlyRow
            label="Birthday"
            value={birthday ?? "Not added yet"}
            note="Set once. To change it, message the cafe."
          />
        </div>
      </Card>
    </div>
  );
}

// A detail that can't be edited here: label, value, a lock and a short note.
// Takes: the label, the value and the note.
// Gives back: a row that lines up with the editable ones.
function ReadOnlyRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brown">{label}</p>
        <p className="break-all text-base text-ink sm:text-sm">{value}</p>
        <p className="text-xs text-muted">{note}</p>
      </div>
      {/* Where the pen would be: a lock, so it's clear it can't be edited */}
      <span className="flex size-11 shrink-0 items-center justify-center text-muted">
        <Lock aria-hidden="true" className="size-4" />
      </span>
    </div>
  );
}

// Writes a birthday for people, e.g. "January 15, 2000".
// Takes: "YYYY-MM-DD". Gives back: the date in words. It's read and written
// in UTC, so the visitor's time zone can never move it to the day before.
function formatBirthday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
