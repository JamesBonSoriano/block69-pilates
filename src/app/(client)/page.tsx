// The Home page ("/"), which guests can see too.
// Where it's used: the website's front page.
//
// Where everything on it comes from (nothing about prices, times or policies
// is typed into this file):
//   - all text: site_content, page "home" (plus "booking" for the what-to-bring
//     list), cached, see src/lib/data/content.ts
//   - prices, address, Maps and Chat links: settings (cached, see
//     src/lib/data/settings.ts). Text can also say {mat_price} etc., which
//     fillSettings() swaps for the current value.
//   - the class days ("Thu to Sun"): the weekly schedule (cached, see
//     src/lib/data/schedule.ts)
// Only small design words (button labels like "About the class") are in the code.
// There's no live class list here: people see the classes and seats left on
// /book (booking step 1).
//
// Layout: one column on phones (docs/designs/PhoneHome.html); on laptops the
// same blocks spread into two or three columns.
// Order: hero, about the class + feature cards, what's included + what to
// bring + health note, how it works, location, call to action.

import { ArrowRight, Feather, MapPin, MessageCircle, PawPrint, Sprout, TriangleAlert } from "lucide-react";
import { CheckList, ContentText, Paragraphs } from "@/components/content/ContentText";
import { SiteImage } from "@/components/content/SiteImage";
import { Section } from "@/components/layout/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { fillSettings, numberedSections } from "@/lib/content-text";
import { getPageContent } from "@/lib/data/content";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatPeso, formatWeekdays } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "Mindful Mat Pilates in Taguig",
  description:
    "Beginner STOTT mat Pilates classes in a small group at Block 69 Cafe, Comembo, Taguig City, with an upsized matcha or coffee after class. Book online.",
  path: "/",
});

// One icon per feature card, in order (feature_1, feature_2, feature_3).
// They're only decoration; the card text comes from site_content.
const FEATURE_ICONS = [Feather, Sprout, PawPrint];

// The Home page.
// Takes: nothing.
// Gives back: every Home block (see the list at the top of this file).
// The page only uses cached data, so Next.js can pre-build it.
export default async function HomePage() {
  // Load all the cached data at the same time, not one after the other
  const [settings, content, bookingContent, schedule] = await Promise.all([
    getPublicSettings(),
    getPageContent("home"),
    getPageContent("booking"), // for the what-to-bring list
    getWeeklySchedule(),
  ]);

  // Swaps {mat_price} etc. in a text for the current settings values.
  // Takes: the text. Gives back: the finished text ("" if there was none).
  const fill = (text: string | null | undefined) => fillSettings(text, settings);

  const { hero, about_class: aboutClass, included, how_it_works: howItWorks } = content;
  const { location_drink: location, cta, health_note: healthNote } = content;
  const whatToBring = bookingContent.what_to_bring;
  const features = numberedSections(content, "feature");
  const steps = numberedSections(content, "step");

  // "Mindful Mat Pilates · Thu to Sun" (the days come from the weekly schedule)
  const classDays = formatWeekdays(schedule.map((day) => day.weekday));
  const kicker = [content.hero_kicker?.title, classDays].filter(Boolean).join(" · ");

  // The main button text, with the price from settings
  const bookLabel = `Book a class · ${formatPeso(settings.classPrice)}`;

  return (
    <>
      {/* ===== Hero =====
          pb-10 / lg:pb-16: the same gap under it as between the other blocks */}
      <Section className="grid gap-4 pb-10 pt-8 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-6 lg:py-16">
        {/* Text (phone: first; laptop: left column, top) */}
        <div className="flex flex-col gap-4 lg:self-end">
          {kicker && <Overline>{kicker}</Overline>}
          {hero?.title && (
            <h1 className="text-4xl font-normal leading-tight lg:text-5xl">{fill(hero.title)}</h1>
          )}
          {hero?.body && (
            <p className="text-[15px] leading-relaxed text-muted lg:text-base">
              <ContentText text={fill(hero.body)} />
            </p>
          )}
        </div>

        {/* Photo spot (phone: middle; laptop: right column, both rows).
            The gradient box until a photo is added (see src/lib/site-images.ts).
            preload: it's the first big picture people see, so load it first. */}
        <SiteImage
          path={hero?.image_path}
          alt=""
          sizes="(min-width: 1152px) 540px, (min-width: 1024px) 45vw, 100vw"
          preload
          className="h-55 rounded-3xl sm:h-80 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-full lg:min-h-90"
        />

        {/* Buttons (phone: last, full width; laptop: left column, under the text) */}
        <div className="flex flex-col gap-3 sm:flex-row lg:self-start">
          <ButtonLink href="/book" className="sm:min-w-56">
            {bookLabel}
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary">
            About the class
          </ButtonLink>
        </div>
      </Section>

      {/* ===== About the class + feature cards ===== */}
      {(aboutClass || features.length > 0) && (
        <Section aria-labelledby="about-class-heading" className="flex flex-col gap-5 pb-10 lg:pb-16">
          {aboutClass && (
            <div className="flex max-w-2xl flex-col gap-3">
              {aboutClass.title && (
                <h2 id="about-class-heading" className="text-2xl font-normal lg:text-3xl">
                  {fill(aboutClass.title)}
                </h2>
              )}
              <Paragraphs text={fill(aboutClass.body)} className="text-[15px] leading-relaxed text-muted lg:text-base" />
            </div>
          )}
          {features.length > 0 && (
            // 1 per row on phones, 3 in a row from tablet width
            <ul className="grid gap-3 sm:grid-cols-3 lg:gap-4">
              {features.map((feature, i) => {
                const Icon = FEATURE_ICONS[i] ?? Sprout;
                return (
                  <li key={i}>
                    <Card className="flex h-full flex-col gap-2">
                      {/* Icon in a tan circle (decoration only) */}
                      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-tan-soft text-brown">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <h3 className="text-base font-semibold">{fill(feature.title)}</h3>
                      <p className="text-sm leading-relaxed text-muted">
                        <ContentText text={fill(feature.body)} />
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* ===== What's included + what to bring + health note ===== */}
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
        {healthNote?.body && (
          // The yellow warning box from the design, across both columns on laptops
          <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-xs leading-relaxed text-warning lg:col-span-2 lg:text-sm">
            <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
            <p>
              <ContentText text={fill(healthNote.body)} />
            </p>
          </div>
        )}
      </Section>

      {/* ===== How it works (3 steps) ===== */}
      {steps.length > 0 && (
        <Section aria-labelledby="how-heading" className="flex flex-col gap-5 pb-10 lg:pb-16">
          <div className="flex flex-col gap-2">
            <h2 id="how-heading" className="text-2xl font-normal lg:text-3xl">
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

      {/* ===== Location (+ the free drink) ===== */}
      {location && (
        <Section aria-labelledby="location-heading" className="pb-10 lg:pb-16">
          {/* Phone: photo on top, text under it. Laptop: photo left, text right. */}
          <Card className="grid gap-5 lg:grid-cols-2 lg:items-center lg:gap-10">
            <SiteImage
              path={location.image_path}
              alt=""
              sizes="(min-width: 1152px) 520px, (min-width: 1024px) 45vw, 100vw"
              className="h-48 rounded-2xl sm:h-64 lg:h-80"
            />
            <div className="flex flex-col gap-3 px-1 pb-1 lg:px-0">
              {location.title && (
                <h2 id="location-heading" className="text-2xl font-normal lg:text-3xl">
                  {fill(location.title)}
                </h2>
              )}
              <Paragraphs text={fill(location.body)} className="text-[15px] leading-relaxed text-muted" />
              {/* Address and Maps link from settings */}
              {settings.cafeAddress && (
                <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brown" />
                  {settings.cafeAddress}
                </p>
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

      {/* ===== Call to action ===== */}
      {cta && (
        <Section aria-labelledby="cta-heading" className="pb-12 lg:pb-20">
          <div className="flex flex-col gap-4 rounded-3xl bg-brown px-6 py-8 text-center lg:items-center lg:px-12 lg:py-12">
            {cta.title && (
              // text-white: headings are dark by default, which can't be read on brown
              <h2 id="cta-heading" className="text-2xl font-normal text-white lg:text-3xl">
                {fill(cta.title)}
              </h2>
            )}
            {cta.body && (
              <p className="text-[15px] leading-relaxed text-tan-soft lg:max-w-xl">
                <ContentText text={fill(cta.body)} />
              </p>
            )}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <ButtonLink href="/book" variant="light" className="sm:min-w-56">
                {bookLabel}
              </ButtonLink>
              {settings.chatUrl && (
                <ButtonLink href={settings.chatUrl} external variant="lightOutline">
                  <MessageCircle aria-hidden="true" className="size-4" />
                  Chat With Us
                </ButtonLink>
              )}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
