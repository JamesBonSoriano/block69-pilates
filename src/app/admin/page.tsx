// The admin area: /admin (a small placeholder for now)
// Where it's used: admins land here after logging in, and the header shows an
// "Admin" link to them. The real admin side (brown sidebar, Dashboard,
// Bookings, Schedule, ...) is built in Step 11.
//
// Protection: src/proxy.ts already turns away guests and clients, and
// requireAdmin() below checks AGAIN on the server using the database's
// is_admin(). A client is sent to the Home page, not an error page.

import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Admin" };

// The admin page.
// Takes: nothing.
// Gives back: the admin background with the welcome card (loaded inside
// <Suspense>, because the admin check reads the login cookies).
export default function AdminPage() {
  return (
    <main id="main" className="flex flex-1 flex-col bg-admin-bg px-5 py-10 lg:px-10 lg:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <Suspense
          fallback={
            <div role="status" className="h-56 animate-pulse rounded-3xl border border-admin-line bg-white">
              <span className="sr-only">Loading…</span>
            </div>
          }
        >
          <AdminWelcome />
        </Suspense>
      </div>
    </main>
  );
}

// The welcome card, only for active admins.
// Takes: nothing (requireAdmin reads the login).
// Gives back: a white admin card with the admin's name and links.
async function AdminWelcome() {
  const admin = await requireAdmin();
  const firstName = admin.fullName.split(" ")[0] || "there";

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-admin-line bg-white p-6 lg:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">Admin</p>
      <h1 className="-mt-2 text-[32px] font-normal leading-tight">Hi, {firstName}</h1>
      <p className="text-sm text-muted">
        You&apos;re logged in as an admin ({admin.email}). The admin pages (Dashboard, Bookings,
        Schedule and the rest) are coming next.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/">Go to the website</ButtonLink>
        <LogoutButton fullWidth className="sm:w-auto" />
      </div>
    </section>
  );
}
