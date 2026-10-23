"use client";
// The floating round "Chat With Us" button at the lower right of every
// client page (Revisions part 1, item 2). It opens the cafe's Messenger or
// Instagram chat (the chat_url setting) in a new tab.
// Where it's used: src/components/layout/SiteShell.tsx (all client and login
// pages). It is not on the admin pages. With no chat link in Settings, the
// shell doesn't show it at all.
//
// "use client" = it runs in the browser, because it has to move UP so it
// never covers other things at the bottom of the screen:
//   - on phones, a sticky bottom bar (the booking steps' Continue / Pay bar),
//     marked with data-sticky-bar (src/components/booking/BookingLayout.tsx)
//   - on every screen size, the FOOTER (Change 17): once the footer scrolls
//     into view, the button rides just above its top edge, so it sits on the
//     page, above the footer, and never covers the footer's links. The footer
//     is marked with data-site-footer (src/components/layout/Footer.tsx).

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The gap between the button and the bottom of the screen (or the bar, or
// the top of the footer), in px.
const GAP = 16;

// The floating chat button (with the page-aware position).
// Takes: chatUrl = the link from settings.
// Gives back: a round link fixed to the lower right corner.
export function ChatButton({ chatUrl }: { chatUrl: string }) {
  // How far above the bottom of the screen the button sits, in px
  const [bottom, setBottom] = useState(GAP);
  // The current page. When it changes, look for a sticky bar again.
  const pathname = usePathname();

  useEffect(() => {
    // The sticky bar matters on phones and tablets only: on laptops the
    // booking summary is a side card, not a bottom bar
    const phone = window.matchMedia("(max-width: 1023.98px)");
    const bar = document.querySelector<HTMLElement>("[data-sticky-bar]");
    const footer = document.querySelector<HTMLElement>("[data-site-footer]");

    // Works out the position: GAP above the highest of (the screen's bottom,
    // the sticky bar, the part of the footer that is showing).
    const place = () => {
      const barHeight = phone.matches && bar ? bar.offsetHeight : 0;
      // How much of the footer is on the screen right now (0 = none)
      const footerShowing = footer ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top) : 0;
      setBottom(Math.max(barHeight, footerShowing) + GAP);
    };
    place();

    // Scrolling changes how much of the footer shows. requestAnimationFrame
    // = at most once per screen refresh, so scrolling stays smooth.
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // Move again when the bar or the page changes height (e.g. an error line
    // appears) or the screen is turned / resized past the laptop width
    const resize = new ResizeObserver(place);
    if (bar) resize.observe(bar);
    resize.observe(document.body);
    phone.addEventListener("change", place);

    // Clean-up when the page changes
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resize.disconnect();
      phone.removeEventListener("change", place);
    };
  }, [pathname]);

  return (
    <a
      href={chatUrl}
      target="_blank"
      rel="noopener noreferrer"
      // Icon-only, so it needs a text label for screen readers
      aria-label="Chat With Us (opens in a new tab)"
      title="Chat With Us"
      // max(...) keeps it above an iPhone's home bar
      style={{ bottom: `max(${bottom}px, env(safe-area-inset-bottom))` }}
      // No slide animation on "bottom": while scrolling it must follow the
      // footer exactly, not lag behind it
      className="fixed right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:right-6 print:hidden"
    >
      <MessageCircle aria-hidden="true" className="size-6" />
    </a>
  );
}

// Shown for a split second while the page address is being read (the
// button can't know about a sticky bar yet): the same button in the corner.
// Takes: chatUrl. Gives back: the plain button.
export function ChatButtonFallback({ chatUrl }: { chatUrl: string }) {
  return (
    <a
      href={chatUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat With Us (opens in a new tab)"
      title="Chat With Us"
      className="fixed bottom-4 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg lg:right-6 print:hidden"
    >
      <MessageCircle aria-hidden="true" className="size-6" />
    </a>
  );
}
