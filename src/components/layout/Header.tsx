// The brown header at the top of every CLIENT page (CLAUDE.md section 7):
// "Block 69 Cafe" with "MAT PILATES + CAFÉ" under it, the nav links, Chat
// With Us, and Log in (guests) or the person's initials + Log out (logged in).
// 64px tall on phones (with a menu button), 96px on laptops.
// Where it's used: src/components/layout/SiteShell.tsx (client and login
// pages). Admin pages get their own sidebar layout in Step 11.
//
// STATIC HEADER, LIVE ACCOUNT PARTS (Next.js Cache Components):
//   The header itself only uses cached settings, so Next.js builds it ahead
//   of time and it shows instantly on every page. Only the small parts that
//   depend on who is logged in (src/components/layout/HeaderAccount.tsx) read
//   the login cookies, and each sits in its OWN <Suspense> with a simple
//   fallback. So a page never waits for the login check.

import Link from "next/link";
import { Suspense } from "react";
import { getPublicSettings } from "@/lib/data/settings";
import {
  DesktopAccount,
  DesktopAccountFallback,
  PhoneAvatar,
  PhoneMenuActions,
  PhoneMenuUser,
} from "./HeaderAccount";
import { HeaderNav } from "./HeaderNav";

// The client header.
// Takes: nothing (it reads the cafe name and Chat With Us link from settings,
// which are cached; see src/lib/data/settings.ts).
// Gives back: the <header> element.
export async function Header() {
  const settings = await getPublicSettings();

  return (
    // sticky top-0: stays at the top while scrolling, so the phone menu
    // (which opens just under it) always lines up
    // print:hidden = left out when a page is printed (e.g. a payment receipt)
    <header className="sticky top-0 z-40 bg-brown print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:h-24 lg:px-8">
        {/* The "logo" (text for now; an uploaded logo image comes later, see docs/PROGRESS.md) */}
        <Link
          href="/"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream"
        >
          <span className="block font-heading text-[22px] font-semibold leading-none text-white lg:text-[26px]">
            {settings.cafeName}
          </span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-cream lg:text-[10px]">
            Mat Pilates + Café
          </span>
        </Link>

        {/* The nav (static). The account parts are handed to it ready-made,
            each wrapped in its own <Suspense>. Phone fallbacks are empty:
            nothing shows there until the login check is done. */}
        <HeaderNav
          chatUrl={settings.chatUrl}
          desktopAccount={
            <Suspense fallback={<DesktopAccountFallback />}>
              <DesktopAccount />
            </Suspense>
          }
          phoneAvatar={
            <Suspense fallback={null}>
              <PhoneAvatar />
            </Suspense>
          }
          phoneMenuUser={
            <Suspense fallback={null}>
              <PhoneMenuUser />
            </Suspense>
          }
          phoneMenuActions={
            <Suspense fallback={null}>
              <PhoneMenuActions />
            </Suspense>
          }
        />
      </div>
    </header>
  );
}
