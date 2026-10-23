// The frame shared by every My Account page (/account/...).
// Where it's used: Next.js wraps each page in src/app/(client)/account/ with it.
// Layout follows docs/designs/Profile.html, Payments.html, Vouchers.html and
// Notifications.html:
//   - laptop: a side card on the left (the account menu + Log out), and the
//     page on the right
//   - phone:  a row of swipeable tabs above the page (Log out is in the
//     header's phone menu)
//
// Protection: src/proxy.ts sends guests to /login first, and EVERY page here
// calls requireClient() again on the server before showing anything private.
// This layout itself shows nothing private, so it doesn't need a login check.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/AccountNav";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Section } from "@/components/layout/Section";

// Private pages: ask Google not to list them. Each page sets its own title.
export const metadata: Metadata = { robots: { index: false } };

// The My Account frame.
// Takes: the page to show (children).
// Gives back: the side menu (laptop) / tabs (phone) and the page.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Section className="flex flex-col gap-6 py-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-10 lg:py-12">
      {/* Laptop: the side card. It stays in view while scrolling (sticky).
          print:hidden = left out when a receipt is printed */}
      <aside className="hidden rounded-3xl border border-line bg-card p-3 lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-2 print:hidden">
        <AccountNav variant="sidebar" />
        <div className="border-t border-line px-1 pt-3">
          <LogoutButton variant="secondary" fullWidth />
        </div>
      </aside>

      {/* Phone: the tabs */}
      <div className="lg:hidden print:hidden">
        <AccountNav variant="tabs" />
      </div>

      {/* min-w-0: lets wide tables scroll inside their box instead of
          pushing the page sideways */}
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </Section>
  );
}
