// The Policies page ("/policies"), which guests can see too: the full
// cancellation policy and the Registration Agreement.
// Where it's used: the "Policies" link in the footer and phone menu, "Read the
// full policies" on About Us, and (Step 9) the booking form, which can link
// straight to one part with /policies#cancellation or /policies#agreement.
//
// Where everything on it comes from:
//   - the heading and intro: site_content, page "policies", section "intro"
//   - the policy and agreement: site_content, page "booking", sections
//     "cancellation_policy" and "agreement" (the SAME text booking step 3
//     shows, so there's only one copy to keep up to date)
//   - {fill-in} words like {mat_price}: settings (see src/lib/content-text.ts)
// The rules themselves are enforced by the database (cancel_my_booking() and
// transfer_my_booking()); this page only explains them.
// A Back button at the top goes back to the page the visitor came from, or
// Home if there's none (Revisions part 1, item 8).

import { MessageCircle } from "lucide-react";
import { ContentText, NumberedList, Paragraphs } from "@/components/content/ContentText";
import { Section } from "@/components/layout/Section";
import { BackButton } from "@/components/ui/BackButton";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { fillSettings, socialLinks } from "@/lib/content-text";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { pageMetadata } from "@/lib/metadata";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "Policies",
  description:
    "The Block 69 Cafe Mindful Mat Pilates cancellation policy and Registration Agreement: moving a class, cancelling, no-shows and class safety.",
  path: "/policies",
});

// The Policies page.
// Takes: nothing.
// Gives back: the intro, then the cancellation policy (a numbered list) and
// the agreement (paragraphs) in two cards. All cached data, so Next.js
// pre-builds it.
export default async function PoliciesPage() {
  // Load all the cached data at the same time
  const [settings, content, bookingContent] = await Promise.all([
    getPublicSettings(),
    getPageContent("policies"),
    getPageContent("booking"),
  ]);

  // Swaps {mat_price} etc. in a text for the current settings values.
  // Takes: the text. Gives back: the finished text ("" if there was none).
  const fill = (text: string | null | undefined) => fillSettings(text, settings);

  const intro = content.intro;
  const policy = bookingContent.cancellation_policy;
  const agreement = bookingContent.agreement;

  return (
    <Section className="py-8 lg:py-16">
      {/* A narrower, centered column than other pages: long text is easier to read that way */}
      <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:gap-6">
        <BackButton />
        <div className="flex flex-col gap-3">
          <Overline>Block 69 Cafe · Mindful Mat Pilates</Overline>
          <h1 className="text-4xl font-normal leading-tight lg:text-5xl">{fill(intro?.title) || "Policies"}</h1>
          {intro?.body && (
            <p className="text-[15px] leading-relaxed text-muted lg:text-base">
              <ContentText text={fill(intro.body)} />
            </p>
          )}
        </div>

        {/* Jump links to the two parts (handy on phones, where the page is long) */}
        {policy && agreement && (
          <nav aria-label="On this page" className="flex flex-wrap gap-2">
            <a href="#cancellation" className="inline-flex min-h-11 items-center rounded-full bg-tan-soft px-4 text-sm font-semibold text-brown hover:bg-line">
              {fill(policy.title)}
            </a>
            <a href="#agreement" className="inline-flex min-h-11 items-center rounded-full bg-tan-soft px-4 text-sm font-semibold text-brown hover:bg-line">
              {fill(agreement.title)}
            </a>
          </nav>
        )}

        {/* scroll-mt: when a jump link scrolls here, stop below the sticky header */}
        {policy && (
          <Card id="cancellation" aria-labelledby="cancellation-heading" role="region" className="flex scroll-mt-20 flex-col gap-4 lg:scroll-mt-28">
            <h2 id="cancellation-heading" className="text-2xl font-normal">
              {fill(policy.title)}
            </h2>
            <NumberedList text={fill(policy.body)} />
          </Card>
        )}

        {agreement && (
          <Card id="agreement" aria-labelledby="agreement-heading" role="region" className="flex scroll-mt-20 flex-col gap-4 lg:scroll-mt-28">
            <h2 id="agreement-heading" className="text-2xl font-normal">
              {fill(agreement.title)}
            </h2>
            {/* Change 17: paragraphs, not a numbered list. {facebook_link} and
                {instagram_link} become links to the pages in Settings. */}
            <div className="flex flex-col gap-3">
              <Paragraphs
                text={fillSettings(agreement.body, settings, { keepLinks: true })}
                links={socialLinks(settings)}
                className="text-sm leading-relaxed lg:text-[15px]"
              />
            </div>
          </Card>
        )}

        {/* Questions about the rules go to the cafe directly */}
        {settings.chatUrl && (
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Something not clear? Ask us before you book.</p>
            <ButtonLink href={settings.chatUrl} external variant="secondary">
              <MessageCircle aria-hidden="true" className="size-4" />
              Chat With Us
            </ButtonLink>
          </div>
        )}
      </div>
    </Section>
  );
}
