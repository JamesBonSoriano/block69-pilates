// The brown header at the top of every CLIENT page (CLAUDE.md section 7):
// "Block 69 Cafe" with "MAT PILATES + CAFÉ" under it, the nav links, Chat
// With Us and Log in. 64px tall on phones (with a menu button), 96px on laptops.
// Where it's used: src/app/(client)/layout.tsx. (Admin pages get their own
// sidebar layout in Step 11.)

import Link from "next/link";
import { Suspense } from "react";
import { getPublicSettings } from "@/lib/data/settings";
import { HeaderNav, HeaderNavContent } from "./HeaderNav";

// The client header.
// Takes: nothing (it reads the cafe name and Chat With Us link from settings,
// which are cached; see src/lib/data/settings.ts).
// Gives back: the <header> element.
export async function Header() {
  const settings = await getPublicSettings();

  return (
    // sticky top-0: stays at the top while scrolling, so the phone menu
    // (which opens just under it) always lines up
    <header className="sticky top-0 z-40 bg-brown">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:h-24 lg:px-8">
        {/* The "logo" (text for now; an uploaded logo image comes with Settings in Step 11) */}
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

        {/*
          The nav highlights the current page, which means reading the web
          address. On pages whose address has a changing part (like a booking
          ID), Next.js only knows it when someone visits, so the nav sits
          inside <Suspense>. Until the address is known it shows the fallback:
          the same nav, just without the highlight.
        */}
        <Suspense fallback={<HeaderNavContent chatUrl={settings.chatUrl} pathname={null} />}>
          <HeaderNav chatUrl={settings.chatUrl} />
        </Suspense>
      </div>
    </header>
  );
}
