"use client";
// A "Back" button that goes to the previous page, like the browser's back
// arrow, or to a fallback page when there is nothing on our site to go back to.
// Where it's used: the Policies page (Revisions part 1, item 8).
//
// "use client" = it needs the browser's history.

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// The Back button.
// Takes: fallbackHref = where to go when there's no page to go back to
// (default: Home), and an optional label (default "Back").
// Gives back: a real <button>. It goes back only when this tab came from a
// page on OUR site; a visitor who opened the link from Google, a chat app or
// a new tab goes to the fallback page instead of leaving the site.
export function BackButton({ fallbackHref = "/", label = "Back" }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();

  // Decides where "Back" goes, when it's pressed.
  // Takes: nothing. Gives back: nothing (it moves to another page).
  function goBack() {
    // document.referrer = the page that linked here ("" if none).
    // history.length > 1 = this tab has a page to go back to.
    let cameFromOurSite = false;
    try {
      cameFromOurSite = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
    } catch {
      cameFromOurSite = false; // a strange referrer: treat it as "not ours"
    }
    if (cameFromOurSite && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-full pr-3 text-sm font-semibold text-brown hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}
