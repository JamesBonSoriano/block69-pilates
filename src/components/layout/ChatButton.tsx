"use client";
// The floating round "Chat With Us" button at the lower right of every
// client page (Revisions part 1, item 2). It opens the cafe's Messenger or
// Instagram chat (the chat_url setting) in a new tab.
// Where it's used: src/components/layout/SiteShell.tsx (all client and login
// pages). It is not on the admin pages. With no chat link in Settings, the
// shell doesn't show it at all.
//
// "use client" = it runs in the browser, because on phones it has to move UP
// when a page has a sticky bottom bar (the booking steps' Continue / Pay
// bar), so it never covers those buttons. The bar is marked with the
// attribute data-sticky-bar (src/components/booking/BookingLayout.tsx).

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The gap between the button and the bottom of the screen (or the bar), in px.
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
    // Phones and tablets only: on laptops the booking summary is a side card,
    // not a bottom bar
    const phone = window.matchMedia("(max-width: 1023.98px)");
    const bar = document.querySelector<HTMLElement>("[data-sticky-bar]");

    // Works out the position: just above the bar if there is one, else the corner.
    const place = () => setBottom(phone.matches && bar ? bar.offsetHeight + GAP : GAP);
    place();

    // Move again when the bar changes height (e.g. an error line appears)
    // or the screen is turned / resized past the laptop width
    const resize = bar ? new ResizeObserver(place) : null;
    if (bar) resize?.observe(bar);
    phone.addEventListener("change", place);

    // Clean-up when the page changes
    return () => {
      resize?.disconnect();
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
      className="fixed right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-[bottom] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:right-6 print:hidden"
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
