// The "page not found" (404) page.
// Where it's used: Next.js shows it for ANY address that doesn't exist (e.g.
// /xyz), and when a page calls notFound(). Because this file sits at the top
// of src/app/, it only gets the root layout (no header or footer), so it adds
// the normal client frame itself with <SiteShell>.
// Next.js also tells search engines not to list this page.

import { Compass } from "lucide-react";
import { SiteShell } from "@/components/layout/SiteShell";
import { Section } from "@/components/layout/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Overline } from "@/components/ui/Overline";

// Tab title for this page ("Page not found · Block 69 Cafe").
export const metadata = {
  title: "Page not found",
};

// The 404 page.
// Takes: nothing (Next.js gives not-found pages no props).
// Gives back: a friendly message with buttons back to Home and About Us,
// inside the normal header and footer.
export default function NotFound() {
  return (
    <SiteShell>
      <Section className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center lg:py-24">
        {/* Icon in a tan circle (decoration only) */}
        <span className="flex size-16 items-center justify-center rounded-full bg-tan-soft text-brown">
          <Compass aria-hidden="true" className="size-8" />
        </span>
        <Overline>Error 404</Overline>
        <h1 className="text-3xl font-normal leading-tight lg:text-5xl">We can&apos;t find that page</h1>
        <p className="max-w-md text-[15px] leading-relaxed text-muted lg:text-base">
          The link may be old, or there may be a typo in the address. Let&apos;s get you back
          to the mat.
        </p>
        {/* Phone: full-width buttons, one under the other. Wider: side by side. */}
        <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href="/">Go to Home</ButtonLink>
          <ButtonLink href="/about" variant="secondary">
            About the class
          </ButtonLink>
        </div>
      </Section>
    </SiteShell>
  );
}
