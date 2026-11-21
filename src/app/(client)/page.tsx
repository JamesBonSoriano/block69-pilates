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
// Only small design words (button labels like "Book Your Session") are in the code.
// There's no live class list here: people see the classes and seats left on
// /book (booking step 1).
//
// Layout: one column on phones (docs/designs/PhoneHome.html); on laptops the
// same blocks spread into two or three columns.
// Order (Change 17, Part D): hero, Class Details & Location, what's included +
// what to bring, how it works, call to action, then Health and Safety
// Information just before the footer.
// Version 1.4: the mat rental line is a card linking to /book?mat=yes (Rent a
// mat already ticked), and the call to action has no Chat With Us button (the
// floating one is the only one).
// Version 1.5: that mat rental card moved from Class Details & Location to
// just under the call to action ("Ready for your first class?").
// (The old "About the class" + 3 cards, the old location block and the small
// health note are no longer shown; their rows stay in the database.)
// Version 1.9: the blocks themselves are drawn by HomeSections
// (src/components/content/HomeSections.tsx), which the admin Content "Live
// preview" uses too, so the preview always matches this page.

import { HomeSections } from "@/components/content/HomeSections";
import { getPageContent } from "@/lib/data/content";
import { getWeeklySchedule } from "@/lib/data/schedule";
import { getPublicSettings } from "@/lib/data/settings";
import { formatWeekdays } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

// Tab title, Google description and link preview for this page.
export const metadata = pageMetadata({
  title: "Mat Pilates for Beginners in Taguig",
  description:
    "Beginner STOTT mat Pilates classes in a small group at Block 69 Cafe, Comembo, Taguig City, with an upsized matcha or coffee after class. Book online.",
  path: "/",
});

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

  return (
    <HomeSections
      settings={settings}
      content={content}
      whatToBring={bookingContent.what_to_bring}
      // "Thu to Sun" (the days come from the weekly schedule)
      classDays={formatWeekdays(schedule.map((day) => day.weekday))}
    />
  );
}
