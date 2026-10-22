// The heading at the top of each My Account page: a small "MY ACCOUNT"
// label, the page title and one line about the page (as in the mockups).
// Where it's used: every page in src/app/(client)/account/.

import type { ReactNode } from "react";
import { Overline } from "@/components/ui/Overline";

// The page heading.
// Takes: the title (e.g. "My Bookings") and an optional intro line.
// Gives back: the label, an <h1> and the intro.
export function AccountHeading({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Overline>My account</Overline>
      <h1 className="text-[32px] font-normal leading-tight lg:text-4xl">{title}</h1>
      {intro && <p className="text-sm leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

// A grey placeholder shown while a page's live part loads.
// Takes: what is loading (for screen readers, e.g. "your bookings") and how
// many placeholder cards to show.
// Gives back: pulsing empty cards.
export function AccountLoading({ label, cards = 2 }: { label: string; cards?: number }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading {label}…</span>
      {Array.from({ length: cards }, (_, n) => (
        <div
          key={n}
          aria-hidden="true"
          className="h-36 animate-pulse rounded-[20px] border border-line bg-card lg:rounded-3xl"
        />
      ))}
    </div>
  );
}

// The message shown when a page's data couldn't be loaded.
// Takes: what couldn't be loaded, e.g. "your bookings".
// Gives back: a card asking them to refresh.
export function AccountLoadError({ what }: { what: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-card p-5 text-sm text-muted lg:rounded-3xl lg:p-6">
      We couldn&apos;t load {what} right now. Please refresh the page in a moment.
    </div>
  );
}
