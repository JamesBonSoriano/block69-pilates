// The shared look of the login pages (docs/designs/PhoneLogin.html): a small
// capital-letter line, a big title, a short intro, then the form.
// Phones: a plain column on the cream background, like the mockup.
// Laptops: the same column inside a card.
// Centered both ways (Change 17): a wrapper that fills the page area (a flex
// column that fills the screen, see SiteShell.tsx) centers the card across
// and up and down, with the same space above and below.
// Where it's used: /login, /signup, /forgot-password and /reset-password.

import type { ReactNode } from "react";

type AuthPageProps = {
  overline: string; // small capitals above the title, e.g. "Welcome back"
  title: string; // the page heading, e.g. "Log in"
  intro?: ReactNode; // one line under the title
  children: ReactNode; // the form
};

// The login page frame.
// Takes: overline, title, optional intro, and the form as children.
// Gives back: a <section> holding all of it.
export function AuthPage({ overline, title, intro, children }: AuthPageProps) {
  return (
    // The wrapper fills the page area and centers the card in it; its padding
    // keeps the same space above and below on laptops
    <div className="flex flex-1 items-center justify-center lg:px-8 lg:py-16">
      <section className="flex w-full max-w-md flex-col gap-4 px-5 py-10 lg:max-w-lg lg:rounded-3xl lg:border lg:border-line lg:bg-card lg:p-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">{overline}</p>
        <h1 className="-mt-2 text-[32px] font-normal leading-tight lg:text-4xl">{title}</h1>
        {intro && <p className="text-sm text-muted">{intro}</p>}
        {children}
      </section>
    </div>
  );
}

// Grey placeholder boxes shown for a split second while a form loads (the
// form reads the web address, e.g. ?next=..., which only arrives with the visit).
// Takes: how many fields to draw.
// Gives back: pulsing boxes shaped like the form (screen readers hear "Loading form").
export function AuthFormSkeleton({ fields }: { fields: number }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading form…</span>
      {Array.from({ length: fields }, (_, n) => (
        <div key={n} aria-hidden="true" className="flex animate-pulse flex-col gap-1.5">
          <div className="h-3.5 w-20 rounded bg-tan-soft" />
          <div className="h-12 rounded-xl bg-tan-soft" />
        </div>
      ))}
      <div aria-hidden="true" className="mt-2 h-11 animate-pulse rounded-full bg-tan-soft" />
    </div>
  );
}
