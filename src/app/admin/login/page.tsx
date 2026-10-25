// The ADMIN log in page: /admin/login (Revisions part 1, item 1).
// Where it's used: guests who open any admin page are sent here by
// src/proxy.ts (with ?next=<that page>), admins land here after Log out,
// and staff can bookmark it.
// Only ADMIN accounts can log in here. A client account is refused. The
// client login refuses admins the same way (src/lib/auth/actions.ts).
// The two login pages never link to each other (Version 1.4).
//
// Version 1.4 layout (the group's Figma design, PDF page 28), in the admin
// brown colors:
//   - laptop (1024px+): two halves side by side. Left: a brown panel with the
//     "69" logo, "Make every session feel effortless." and a short line.
//     Right: the "Welcome back" form.
//   - phone: the brown panel sits on top (short), the form under it.
//
// It sits OUTSIDE the admin frame (the frame is in src/app/admin/(panel)/),
// so it has no admin menu and no admin check.
//
// The address can carry:
//   ?next=/admin/bookings   the admin page to open after logging in
//   ?error=deactivated      the account was deactivated and has been logged out

import type { Metadata, Viewport } from "next";
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
// Gives back: the brown welcome panel and the form, side by side on laptops
// and stacked on phones.
export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  // The cafe name (a cached setting, the same for everyone)
  const settings = await getPublicSettings();

  return (
    // flex-1 fills the screen under <body>. data-theme="admin" keeps the
    // brown admin colors (see globals.css).
    <main id="main" data-theme="admin" className="flex flex-1 flex-col bg-card lg:grid lg:grid-cols-2">
      {/* ===== The brown welcome panel (top on phones, left on laptops) ===== */}
      <section
        aria-label={`${settings.cafeName} admin`}
        className="flex flex-col gap-6 bg-brown px-6 py-7 text-white lg:justify-between lg:px-14 lg:py-12"
      >
        {/* The "69" logo with the cafe name and "ADMIN", like the admin menu */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-caramel font-heading text-[13px] lg:size-12"
          >
            69
          </span>
          <span>
            <span className="block font-heading text-lg font-semibold">{settings.cafeName}</span>
            <span className="block text-[10px] uppercase tracking-[0.1em] text-tan-soft">Admin</span>
          </span>
        </div>

        <div className="flex flex-col gap-3 lg:gap-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tan">Welcome back</p>
          {/* Shorter on phones so the form stays close to the top */}
          <p className="max-w-md font-heading text-[28px] font-semibold leading-tight lg:text-[56px] lg:leading-[1.05]">
            Make every session feel effortless.
          </p>
          {/* Hidden on small phones to keep the panel short */}
          <p className="hidden max-w-md text-sm leading-relaxed text-tan-soft sm:block lg:text-base">
            Welcome your guests and keep every class at {settings.cafeName} running smoothly.
          </p>
        </div>

        {/* An empty spacer on laptops, so the words sit in the middle */}
        <span aria-hidden="true" className="hidden lg:block" />
      </section>

      {/* ===== The form (under the panel on phones, right on laptops) ===== */}
      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 lg:items-center lg:py-12">
        <div className="flex w-full max-w-md flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">Admin portal</p>
            <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">Welcome back</h1>
          </div>
          <Suspense fallback={<AuthFormSkeleton fields={2} />}>
            <AdminLoginFormWithParams searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
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
