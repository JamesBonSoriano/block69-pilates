// The About Us page ("/about"), which guests can see too.
// Where it's used: "About Us" in the header, footer and phone menu, and the
// "About us" button on Home.
//
// Where everything on it comes from (nothing about prices, times or policies
// is typed into this file):
//   - all text: site_content, page "about" (cached, see src/lib/data/content.ts).
//     Text can say {mat_price}, {cutoff_time} etc.; fillSettings() swaps
//     them for the current settings values.
//   - class days, length and group size (the quick facts): the weekly
//     schedule (schedule_templates, cached, see src/lib/data/schedule.ts)
//   - price, address, email, social and Chat links: settings (cached)
// Only small design words (button labels, "FAQ") are in the code.
//
// Blocks, in order: about the cafe, about the class (+ quick facts), the
// instructor, the short cancellation policy, the FAQ, then visit us and
// contact us.
// Change 17, Part E: the Class Schedule and the Health and Safety sections
// were removed (Health and Safety is on Home now; the classes and times are
// on /book), and the cafe's phone number is no longer listed under Contact.
// Layout: one column on phones; two columns for several blocks on laptops.

import {
  ArrowRight,
  AtSign,
  CalendarDays,
  ChevronDown,
  Clock,
  Coffee,
  Mail,
  MapPin,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CheckList, ContentText, Paragraphs } from "@/components/content/ContentText";
import { SiteImage } from "@/components/content/SiteImage";
import { Section } from "@/components/layout/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Overline } from "@/components/ui/Overline";
import { fillSettings, numberedSections } from "@/lib/content-text";
import { getPageContent } from "@/lib/data/content";
import { getWeeklySchedule, type ScheduleDay } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatPeso, formatWeekdays, minutesBetween } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "About Us",
  description:
    "Meet Block 69 Cafe in Comembo, Taguig, and our beginner Mindful Mat Pilates class: the STOTT method, small groups, the class schedule, policies and FAQ.",
  path: "/about",
});

// Shared look for the main headings on this page.
const headingClasses = "text-2xl font-normal lg:text-3xl";

// The About Us page.
// Takes: nothing.
// Gives back: every About Us block (see the list at the top of this file).
// Everything here is cached data, so Next.js can pre-build the whole page.
export default async function AboutPage() {
  // Load all the cached data at the same time
  const [settings, content, schedule] = await Promise.all([
    getPublicSettings(),
    getPageContent("about"),
    getWeeklySchedule(),
  ]);

  // Swaps {mat_price} etc. in a text for the current settings values.
  // Takes: the text. Gives back: the finished text ("" if there was none).
  const fill = (text: string | null | undefined) => fillSettings(text, settings);

  const { cafe, class: aboutClass, instructor, instructor_name: instructorName } = content;
  const { policy_summary: policy, visit, contact } = content;
  const faqs = numberedSections(content, "faq");

  return (
    <>
      {/* ===== About the cafe (the page's main heading) ===== */}
      <Section className="grid gap-5 py-8 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-16">
        <div className="flex flex-col gap-4">
          <Overline>About Us</Overline>
          <h1 className="text-4xl font-normal leading-tight lg:text-5xl">
            {fill(cafe?.title) || "About Block 69 Cafe"}
          </h1>
          <Paragraphs text={fill(cafe?.body)} className="text-[15px] leading-relaxed text-muted lg:text-base" />
        </div>
        {/* Photo of the cafe (the gradient box until one is added) */}
        <SiteImage
          path={cafe?.image_path}
          alt=""
          sizes="(min-width: 1152px) 540px, (min-width: 1024px) 45vw, 100vw"
          preload
          className="h-55 rounded-3xl sm:h-80 lg:h-96"
        />
      </Section>

      {/* ===== About the class + quick facts ===== */}
      {aboutClass && (
        <Section aria-labelledby="class-heading" className="pb-10 lg:pb-16">
          <Card className="flex flex-col gap-5 lg:flex-row lg:gap-12">
            <div className="flex flex-col gap-3 lg:flex-1">
              <h2 id="class-heading" className={headingClasses}>
                {fill(aboutClass.title)}
              </h2>
              <Paragraphs text={fill(aboutClass.body)} className="text-[15px] leading-relaxed text-muted" />
            </div>
            <ClassFacts schedule={schedule} classPrice={settings.classPrice} />
          </Card>
        </Section>
      )}

      {/* ===== The instructor ===== */}
      {(instructor || instructorName) && (
        <Section aria-labelledby="instructor-heading" className="pb-10 lg:pb-16">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            {/* Photo (the gradient circle until one is added). Its alt text
                is the instructor's name. */}
            <SiteImage
              path={instructor?.image_path}
              alt={fill(instructorName?.title)}
              sizes="160px"
              className="size-32 shrink-0 rounded-full border-4 border-card lg:size-40"
            />
            <div className="flex flex-col gap-2">
              {instructor?.title && (
                <Overline as="h2" id="instructor-heading" className="mb-1">
                  {fill(instructor.title)}
                </Overline>
              )}
              {instructorName?.title && (
                <p className="font-heading text-2xl text-brown lg:text-3xl">
                  <ContentText text={fill(instructorName.title)} />
                </p>
              )}
              {instructorName?.body && (
                <p className="text-sm font-semibold text-muted">
                  <ContentText text={fill(instructorName.body)} />
                </p>
              )}
              <Paragraphs text={fill(instructor?.body)} className="max-w-2xl text-[15px] leading-relaxed text-muted" />
            </div>
          </div>
        </Section>
      )}

      {/* ===== Cancellation policy in short ===== */}
      {policy && (
        <Section aria-labelledby="policy-heading" className="pb-10 lg:pb-16">
          <Card className="flex flex-col gap-4">
            <h2 id="policy-heading" className="text-xl font-normal lg:text-2xl">
              {fill(policy.title)}
            </h2>
            <CheckList text={fill(policy.body)} marker="dot" />
            {/* The classes and their times are on the booking page */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <Link
                href="/policies"
                className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-brown hover:underline"
              >
                Read the full policies
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <ButtonLink href="/book" className="max-sm:w-full">
                See open classes
              </ButtonLink>
            </div>
          </Card>
        </Section>
      )}

      {/* ===== FAQ ===== */}
      {faqs.length > 0 && (
        <Section aria-labelledby="faq-heading" className="flex flex-col gap-4 pb-10 lg:pb-16">
          <h2 id="faq-heading" className={headingClasses}>
            Frequently asked questions
          </h2>
          {/* Each question opens and closes on its own. <details> does this
              without any JavaScript and works with the keyboard. */}
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
            {faqs.map((faq, i) => (
              <details key={i} className="group rounded-2xl border border-line bg-card">
                <summary
                  className={
                    // list-none + the webkit rule hide the browser's own triangle
                    "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 " +
                    "text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden lg:text-[15px] " +
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
                  }
                >
                  <ContentText text={fill(faq.title)} />
                  {/* The arrow turns upside down when the answer is open */}
                  <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-brown transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <Paragraphs text={fill(faq.body)} className="text-sm leading-relaxed text-muted" />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {/* ===== Visit us + contact us ===== */}
      <Section className="grid gap-3 pb-12 lg:grid-cols-2 lg:gap-4 lg:pb-20">
        {visit && (
          <Card aria-labelledby="visit-heading" role="region" className="flex flex-col gap-3">
            <h2 id="visit-heading" className="text-xl font-normal lg:text-2xl">
              {fill(visit.title)}
            </h2>
            {settings.cafeAddress && (
              <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brown" />
                {settings.cafeAddress}
              </p>
            )}
            <Paragraphs text={fill(visit.body)} className="text-sm leading-relaxed text-muted" />
            {settings.mapsUrl && (
              <ButtonLink href={settings.mapsUrl} external variant="secondary" className="mt-auto self-start max-sm:w-full">
                Open in Google Maps
                <ArrowRight aria-hidden="true" className="size-4" />
              </ButtonLink>
            )}
          </Card>
        )}

        {contact && (
          <Card aria-labelledby="contact-heading" role="region" className="flex flex-col gap-3">
            <h2 id="contact-heading" className="text-xl font-normal lg:text-2xl">
              {fill(contact.title)}
            </h2>
            <Paragraphs text={fill(contact.body)} className="text-sm leading-relaxed text-muted" />
            <ul className="flex flex-col text-sm">
              {settings.cafeEmail && (
                <ContactItem icon={Mail} href={`mailto:${settings.cafeEmail}`}>
                  {settings.cafeEmail}
                </ContactItem>
              )}
              {/* (No phone number here: Change 17 took it off this page) */}
              {settings.instagramUrl && (
                <ContactItem icon={AtSign} href={settings.instagramUrl} external>
                  Instagram
                </ContactItem>
              )}
              {settings.facebookUrl && (
                <ContactItem icon={AtSign} href={settings.facebookUrl} external>
                  Facebook
                </ContactItem>
              )}
            </ul>
            {settings.chatUrl && (
              <ButtonLink href={settings.chatUrl} external className="mt-auto self-start max-sm:w-full">
                <MessageCircle aria-hidden="true" className="size-4" />
                Chat With Us
              </ButtonLink>
            )}
          </Card>
        )}
      </Section>
    </>
  );
}

// The quick facts about the class, worked out from the weekly schedule and
// settings, so they always match what clients can book.
// Takes: the weekly schedule and the class price.
// Gives back: a list like "50 minutes · Up to 4 people · Thu to Sun · ₱500 per
// class" (facts that can't be worked out, e.g. with no schedule, are left out).
function ClassFacts({ schedule, classPrice }: { schedule: ScheduleDay[]; classPrice: number }) {
  const slots = schedule.flatMap((day) => day.slots);

  // Class length: "50 minutes", or "45–50 minutes" if classes differ
  const lengths = slots.map((slot) => minutesBetween(slot.startTime, slot.endTime));
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  const length = shortest === longest ? `${shortest} minutes` : `${shortest}–${longest} minutes`;

  // Group size: the biggest default number of seats
  const groupSize = Math.max(...slots.map((slot) => slot.capacity));

  const facts: { icon: ComponentType<{ className?: string }>; text: string }[] = [
    ...(slots.length > 0
      ? [
          { icon: Clock, text: length },
          { icon: Users, text: `Small groups, up to ${groupSize} people` },
          { icon: CalendarDays, text: formatWeekdays(schedule.map((day) => day.weekday)) },
        ]
      : []),
    { icon: Coffee, text: `${formatPeso(classPrice)} per class, drink included` },
  ];

  return (
    <ul className="flex flex-col gap-2 lg:w-80 lg:shrink-0">
      {facts.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-3 rounded-2xl bg-tan-soft px-4 py-3 text-sm font-semibold text-brown">
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          {text}
        </li>
      ))}
    </ul>
  );
}

// One line in the "Contact us" list: an icon and a link.
// Takes: the icon, the link (null = show the text without a link), whether
// it opens another website in a new tab, and the text.
// Gives back: an <li> at least 44px tall, so it's easy to tap.
function ContactItem({
  icon: Icon,
  href,
  external = false,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  href: string | null;
  external?: boolean;
  children: ReactNode;
}) {
  const inner = (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-brown" />
      {children}
    </>
  );
  const classes = "inline-flex min-h-11 items-center gap-2.5 break-all";

  return (
    <li>
      {href ? (
        <a
          href={href}
          className={`${classes} font-semibold text-brown hover:underline`}
          // Other websites open in a new tab; "noopener" stops them controlling our page
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {inner}
        </a>
      ) : (
        <span className={classes}>{inner}</span>
      )}
    </li>
  );
}
