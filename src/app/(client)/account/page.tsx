// My Account: /account (a small placeholder for now)
// Where it's used: "My Account" in the header.
// It shows the logged-in person's name, email and phone number, so we can
// test log in and sign up. The real My Account pages (Profile, My Bookings,
// Payments, My Vouchers, Notifications) are built in Step 10.
//
// Protection: src/proxy.ts already sends guests to /login, and
// requireUser() below checks AGAIN on the server before anything private is shown.

import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/user";
import { initialsOf } from "@/lib/format";

export const metadata: Metadata = { title: "My Account" };

// The My Account page.
// Takes: nothing.
// Gives back: the page heading, and the person's details (loaded inside
// <Suspense>, because they come from the login cookies).
export default function AccountPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 lg:px-8 lg:py-14">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">My account</p>
        <h1 className="text-[32px] font-normal leading-tight lg:text-4xl">Your details</h1>
      </div>
      <Suspense fallback={<AccountDetailsLoading />}>
        <AccountDetails />
      </Suspense>
    </section>
  );
}

// The person's details card.
// Takes: nothing (requireUser reads the login).
// Gives back: a card with their initials, name, email, phone and Log out.
// Guests never get this far: requireUser sends them to the login page.
async function AccountDetails() {
  const user = await requireUser("/account");

  return (
    <>
      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {/* Round avatar with their initials */}
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-tan-soft font-heading text-[22px] font-semibold text-brown"
          >
            {initialsOf(user.fullName, user.email)}
          </span>
          <p className="font-heading text-[22px] font-semibold text-brown">
            {user.fullName || "No name yet"}
          </p>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <dt>
              <Mail aria-hidden="true" className="size-4 text-muted" />
              <span className="sr-only">Email</span>
            </dt>
            {/* break-all: long emails wrap instead of pushing the page sideways */}
            <dd className="break-all">{user.email}</dd>
          </div>
          <div className="flex items-center gap-3">
            <dt>
              <Phone aria-hidden="true" className="size-4 text-muted" />
              <span className="sr-only">Phone number</span>
            </dt>
            <dd>{user.mobile ?? "No phone number yet"}</dd>
          </div>
        </dl>

        <LogoutButton variant="danger" formClassName="sm:self-start" fullWidth className="sm:w-auto" />
      </Card>

      <p className="text-sm text-muted">
        Your bookings, payments and vouchers will show here soon.
      </p>
    </>
  );
}

// A grey placeholder card shown while the details load.
// Takes: nothing.
// Gives back: a pulsing card (screen readers hear "Loading your details").
function AccountDetailsLoading() {
  return (
    <div role="status" className="flex h-56 animate-pulse flex-col gap-4 rounded-[20px] border border-line bg-card p-5 lg:rounded-3xl lg:p-6">
      <span className="sr-only">Loading your details…</span>
      <div aria-hidden="true" className="flex items-center gap-4">
        <div className="size-16 rounded-full bg-tan-soft" />
        <div className="h-5 w-40 rounded bg-tan-soft" />
      </div>
      <div aria-hidden="true" className="h-4 w-56 rounded bg-tan-soft" />
      <div aria-hidden="true" className="h-4 w-36 rounded bg-tan-soft" />
    </div>
  );
}
