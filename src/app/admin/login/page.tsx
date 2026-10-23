// The ADMIN log in page: /admin/login (Revisions part 1, item 1).
// Where it's used: guests who open any admin page are sent here by
// src/proxy.ts (with ?next=<that page>), and staff can bookmark it.
// Only ADMIN accounts can log in here. A client account is refused and
// pointed to the client login (/login). The client login refuses admins the
// same way (src/lib/auth/actions.ts).
//
// It sits OUTSIDE the admin frame (the frame is in src/app/admin/(panel)/),
// so it has no admin menu and no admin check. Its look follows the admin
// side: the admin background, a white card with the admin border, and the
// "69" logo like the admin side menu.
//
// The address can carry:
//   ?next=/admin/bookings   the admin page to open after logging in
//   ?error=deactivated      the account was deactivated and has been logged out

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/AuthPage";
import { LoginForm } from "@/components/auth/LoginForm";
import { DEACTIVATED_MESSAGE } from "@/lib/auth/errors";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { getPublicSettings } from "@/lib/data/settings";

// Tab title. Private page: ask Google not to list it.
export const metadata: Metadata = { title: "Admin log in", robots: { index: false } };

// The phone's own top bar stays admin brown here (the website uses sage).
export const viewport: Viewport = { themeColor: "#43271B" };

// The admin login page.
// Takes: searchParams (the ?next=... and ?error=... part of the address).
// Gives back: the logo, the card with the form, and a link back to the website.
export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  // The cafe name (a cached setting, the same for everyone)
  const settings = await getPublicSettings();

  return (
    // flex-1 fills the screen under <body>; the card sits in the middle.
    // data-theme="admin" keeps the brown admin colors (see globals.css).
    <main
      id="main"
      data-theme="admin"
      className="flex flex-1 flex-col items-center justify-center bg-admin-bg px-4 py-10"
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* The "69" logo with the cafe name and "ADMIN", like the admin menu */}
        <div className="flex items-center justify-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brown font-heading text-sm text-white"
          >
            69
          </span>
          <span>
            <span className="block font-heading text-lg font-semibold text-brown">{settings.cafeName}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Admin</span>
          </span>
        </div>

        <section className="flex flex-col gap-4 rounded-3xl border border-admin-line bg-white p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">Cafe staff only</p>
          <h1 className="-mt-2 text-[28px] font-normal leading-tight sm:text-[32px]">Admin log in</h1>
          <p className="text-sm text-muted">Manage classes, bookings, payments and the website.</p>
          <Suspense fallback={<AuthFormSkeleton fields={2} />}>
            <AdminLoginFormWithParams searchParams={searchParams} />
          </Suspense>
        </section>

        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center self-center text-sm font-semibold text-brown underline-offset-4 hover:underline"
        >
          Back to the website
        </Link>
      </div>
    </main>
  );
}

// Reads the address, then shows the form.
// Takes: the searchParams promise from the page.
// Gives back: the admin LoginForm with a safe "next" and any notice.
async function AdminLoginFormWithParams({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  // The only message this page shows from the address
  const notice =
    firstParam(params.error) === "deactivated" ? ({ tone: "error", text: DEACTIVATED_MESSAGE } as const) : null;

  return <LoginForm portal="admin" next={next} notice={notice} />;
}
