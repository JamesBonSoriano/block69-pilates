// Every block of the Home page, drawn from the page text, the settings and
// the class days. Version 1.9 moved this out of src/app/(client)/page.tsx so
// the SAME code (same components, same styles) draws:
//   - the real Home page ("/"), and
//   - the "Live preview" on admin Content > Home page
//     (src/components/admin/ContentSectionPreview.tsx), which passes the
//     admin's unsaved text instead of the saved text.
// It has no "use client" and loads nothing itself, so it works on the
// server (Home) and in the browser (the preview) alike.
//
// Order (Change 17, Part D): hero, Class Details & Location, what's included +
// what to bring, how it works, call to action (+ the mat rental card under it,
// Version 1.5), then Health and Safety Information just before the footer.
// Version 1.4: the mat rental line is a card linking to /book?mat=yes, and the
// call to action has no Chat With Us button (the floating one is the only one).

import { ArrowRight, MapPin, PawPrint, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { CheckList, ContentText, Paragraphs } from "@/components/content/ContentText";
import { SiteImage } from "@/components/content/SiteImage";
import { Section } from "@/components/layout/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { fillSettings, numberedSections, splitLines } from "@/lib/content-text";
import type { ContentBlock } from "@/lib/data/content";
import type { PublicSettings } from "@/lib/data/settings";
import { formatPeso } from "@/lib/format";

// The main button's words. No price on it: the proposal calls that
// redundant (the price is in "What's included" and on the booking pages).
const BOOK_LABEL = "Book Your Session";

// What the Home blocks need.
export type HomeSectionsProps = {
  settings: PublicSettings; // prices, cafe name, address, Maps link
  content: Record<string, ContentBlock | undefined>; // site_content for page "home", by section
  whatToBring: ContentBlock | undefined; // booking/what_to_bring
  classDays: string; // e.g. "Thu to Sat" (from the weekly schedule)
  preview?: boolean; // true in the admin preview (the hero photo isn't preloaded)
};

// All the Home blocks.
// Takes: the props above.
// Gives back: the sections, in Home page order. A block whose text is empty
// is left out, exactly like on the live page.
export function HomeSections({ settings, content, whatToBring, classDays, preview = false }: HomeSectionsProps) {
  // Swaps {mat_price} etc. in a text for the current settings values.
  // Takes: the text. Gives back: the finished text ("" if there was none).
  const fill = (text: string | null | undefined) => fillSettings(text, settings);

  const { hero, class_details: classDetails, mat_note: matNote, included, how_it_works: howItWorks } = content;
  const { cta, health_safety: healthSafety } = content;
  const steps = numberedSections(content, "step");
  const healthItems = splitLines(fill(healthSafety?.body));

  // "Mindful Mat Pilates · Thu to Sun" (the days come from the weekly schedule)
  const kicker = [content.hero_kicker?.title, classDays].filter(Boolean).join(" · ");

  return (
    <>
      {/* ===== Hero =====
          pb-10 / lg:pb-16: the same gap under it as between the other blocks */}
      <Section className="grid gap-4 pb-10 pt-8 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-6 lg:py-16">
        {/* Text (phone: first; laptop: left column, top) */}
        <div className="flex flex-col gap-4 lg:self-end">
          {kicker && <Overline>{kicker}</Overline>}
          {hero?.title && (
            // The admin preview already has its own page heading, so the
            // hero title is a plain paragraph there (same look)
            preview ? (
              <p className="font-heading text-4xl font-normal leading-tight text-heading lg:text-5xl">{fill(hero.title)}</p>
            ) : (
              <h1 className="text-4xl font-normal leading-tight lg:text-5xl">{fill(hero.title)}</h1>
            )
          )}
          {hero?.body && (
            <p className="text-[15px] leading-relaxed text-muted lg:text-base">
              <ContentText text={fill(hero.body)} />
            </p>
          )}
        </div>

        {/* Photo spot (phone: middle; laptop: right column, both rows).
            The gradient box until a photo is added (see src/lib/site-images.ts).
            preload: it's the first big picture people see, so load it first
            (not in the admin preview). */}
        <SiteImage
          path={hero?.image_path}
          alt=""
          sizes="(min-width: 1152px) 540px, (min-width: 1024px) 45vw, 100vw"
          preload={!preview}
          className="h-55 rounded-3xl sm:h-80 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-full lg:min-h-90"
        />

        {/* Buttons (phone: last, full width; laptop: left column, under the text) */}
        <div className="flex flex-col gap-3 sm:flex-row lg:self-start">
          <ButtonLink href="/book" className="sm:min-w-56">
            {BOOK_LABEL}
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary">
            About us
          </ButtonLink>
        </div>
      </Section>

      {/* ===== Class Details & Location =====
          One section for the class and where it is (the address and Maps
          button are shown only once). */}
      {classDetails && (
        <Section aria-labelledby={preview ? undefined : "class-details-heading"} className="pb-10 lg:pb-16">
          {/* Phone: photo on top, text under it. Laptop: photo left, text right. */}
          <Card className="grid gap-5 lg:grid-cols-2 lg:items-center lg:gap-10">
            <SiteImage
              path={classDetails.image_path}
              alt=""
              sizes="(min-width: 1152px) 520px, (min-width: 1024px) 45vw, 100vw"
              className="h-48 rounded-2xl sm:h-64 lg:h-full lg:min-h-80"
            />
            <div className="flex flex-col gap-4 px-1 pb-1 lg:px-0">
              {classDetails.title && (
                <h2 id={preview ? undefined : "class-details-heading"} className="text-2xl font-normal lg:text-3xl">
                  {fill(classDetails.title)}
                </h2>
              )}
              {/* A short description of the class */}
              <Paragraphs text={fill(classDetails.body)} className="text-[15px] leading-relaxed text-muted" />

              {/* Where: the full address and the Maps link, from Settings */}
              {settings.cafeAddress && (
                <div className="flex flex-col gap-1">
                  <Overline as="h3">Location</Overline>
                  <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                    <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brown" />
                    <span>
                      {settings.cafeName}, {settings.cafeAddress}
                    </span>
                  </p>
                </div>
              )}
              {settings.mapsUrl && (
                <ButtonLink href={settings.mapsUrl} external variant="secondary" className="self-start max-sm:w-full">
                  Open in Google Maps
                  <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              )}
            </div>
          </Card>
        </Section>
      )}

      {/* ===== What's included + what to bring ===== */}
      {(included || whatToBring) && (
        <Section className="grid gap-3 pb-10 lg:grid-cols-2 lg:gap-4 lg:pb-16">
          {included && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                {included.title && <Overline as="h2">{fill(included.title)}</Overline>}
                {/* The class price, big, from settings */}
                <p className="whitespace-nowrap text-xs text-muted">
                  <span className="font-heading text-2xl font-semibold text-brown">
                    {formatPeso(settings.classPrice)}
                  </span>{" "}
                  per class
                </p>
              </div>
              <CheckList text={fill(included.body)} />
            </Card>
          )}
          {whatToBring && (
            <Card className="flex flex-col gap-3">
              {whatToBring.title && <Overline as="h2">{fill(whatToBring.title)}</Overline>}
              <CheckList text={fill(whatToBring.body)} />
            </Card>
          )}
        </Section>
      )}

      {/* ===== How it works (3 steps) ===== */}
      {steps.length > 0 && (
        <Section aria-labelledby={preview ? undefined : "how-heading"} className="flex flex-col gap-5 pb-10 lg:pb-16">
          <div className="flex flex-col gap-2">
            <h2 id={preview ? undefined : "how-heading"} className="text-2xl font-normal lg:text-3xl">
              {fill(howItWorks?.title) || "How it works"}
            </h2>
            {howItWorks?.body && (
              <p className="text-[15px] text-muted lg:text-base">
                <ContentText text={fill(howItWorks.body)} />
              </p>
            )}
          </div>
          {/* A real numbered list, so screen readers hear "1 of 3" etc. */}
          <ol className="grid gap-3 sm:grid-cols-3 lg:gap-4">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-4 sm:flex-col sm:gap-3">
                {/* Step number in a sage-dark circle (screen readers already hear the number) */}
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg font-semibold text-on-primary"
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold lg:text-lg">{fill(step.title)}</h3>
                  <p className="text-sm leading-relaxed text-muted">
                    <ContentText text={fill(step.body)} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ===== Call to action, with the mat rental card under it ===== */}
      {(cta || matNote?.body) && (
        <Section
          aria-labelledby={cta && !preview ? "cta-heading" : undefined}
          className="flex flex-col gap-3 pb-10 lg:pb-16"
        >
          {cta && (
            // bg-primary: the same green as the header and footer.
            // On sage-dark: white heading 5.1:1, cream text 4.9:1 (WCAG AA).
            // The "light" button is cream with brown text, a cream focus
            // outline and a light sage hover, all visible on the green.
            <div className="flex flex-col gap-4 rounded-3xl bg-primary px-6 py-8 text-center lg:items-center lg:px-12 lg:py-12">
              {cta.title && (
                // text-white: headings are dark by default, which can't be read on green
                <h2 id={preview ? undefined : "cta-heading"} className="text-2xl font-normal text-white lg:text-3xl">
                  {fill(cta.title)}
                </h2>
              )}
              {cta.body && (
                <p className="text-[15px] leading-relaxed text-cream lg:max-w-xl">
                  <ContentText text={fill(cta.body)} />
                </p>
              )}
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <ButtonLink href="/book" variant="light" className="sm:min-w-56">
                  {BOOK_LABEL}
                </ButtonLink>
              </div>
            </div>
          )}

          {/* The mat rental card: "Mat rental is {mat_price}, and 100% goes
              to feeding stray animals in Taguig. Add it to your booking"
              (the price from settings). The whole card is one link to
              booking step 1 with Rent a mat already ticked. */}
          {matNote?.body && (
            <Link
              href="/book?mat=yes"
              className="group flex min-h-11 items-start gap-2.5 rounded-2xl border border-transparent bg-sage-light px-4 py-3 text-sm text-ink hover:border-tan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:items-center lg:justify-center lg:px-6"
            >
              <PawPrint aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary lg:mt-0" />
              <span>
                <ContentText text={fill(matNote.body)} />{" "}
                <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:underline">
                  Add it to your booking
                  <ArrowRight aria-hidden="true" className="size-4" />
                </span>
              </span>
            </Link>
          )}
        </Section>
      )}

      {/* ===== Health and Safety Information (just before the footer) =====
          One item per line of text. */}
      {healthItems.length > 0 && (
        <Section aria-labelledby={preview ? undefined : "health-heading"} className="pb-12 lg:pb-20">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning">
                <ShieldAlert aria-hidden="true" className="size-5" />
              </span>
              <h2 id={preview ? undefined : "health-heading"} className="text-xl font-normal lg:text-2xl">
                {fill(healthSafety?.title) || "Health and Safety Information"}
              </h2>
            </div>
            <ul className="flex flex-col gap-2.5">
              {healthItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink">
                  {/* A small dot, like a bullet point (decoration only) */}
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-warning" />
                  <ContentText text={item} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </>
  );
}
