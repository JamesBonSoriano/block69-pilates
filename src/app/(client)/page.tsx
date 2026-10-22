// The Home page ("/"), which guests can see too.
// Where it's used: the website's front page.
//
// This first version proves the website is connected to the REAL database:
//   - the hero text and health note come from site_content (cached, see src/lib/data/content.ts)
//   - the prices come from settings (cached, see src/lib/data/settings.ts)
//   - "Next open sessions" come from get_open_sessions() and are NEVER cached,
//     so seats left are always live (see src/lib/data/sessions.ts)
// Step 8 adds the rest of the Home page (about the class, location, feature cards).
//
// Layout: one column on phones (docs/designs/PhoneHome.html); on laptops the
// hero becomes two columns and the sessions show three per row.

import { Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SessionCard } from "@/components/sessions/SessionCard";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPageContent } from "@/lib/data/content";
import { getUpcomingSessions } from "@/lib/data/sessions";
import { getPublicSettings } from "@/lib/data/settings";
import { formatPeso } from "@/lib/format";

// How many classes to list under "Next open sessions".
const SESSIONS_TO_SHOW = 6;

// The Home page.
// Takes: nothing.
// Gives back: the hero, the live session list and the "what's included" box.
// The page itself only uses cached data, so Next.js can pre-build it. The live
// session list streams in separately inside <Suspense>.
export default async function HomePage() {
  // Load the cached settings and page text at the same time
  const [settings, content] = await Promise.all([
    getPublicSettings(),
    getPageContent("home"),
  ]);
  const hero = content.hero;
  const healthNote = content.health_note?.body;

  return (
    <>
      {/* ===== Hero ===== */}
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-8 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-6 lg:px-8 lg:py-16">
        {/* Text (phone: first; laptop: left column, top) */}
        <div className="flex flex-col gap-4 lg:self-end">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">
            Mindful Mat Pilates · Thu to Sun
          </p>
          {hero?.title && (
            <h1 className="text-4xl font-normal leading-tight lg:text-5xl">{hero.title}</h1>
          )}
          {hero?.body && (
            <p className="text-[15px] leading-relaxed text-muted lg:text-base">{hero.body}</p>
          )}
        </div>

        {/* Photo spot (phone: middle; laptop: right column, both rows).
            A plain gradient until the admin uploads a photo (Content Management, Step 11). */}
        <div
          aria-hidden="true"
          className="h-55 rounded-3xl bg-linear-135 from-tan to-caramel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-full lg:min-h-90"
        />

        {/* Buttons (phone: last, full width; laptop: left column, under the text) */}
        <div className="flex flex-col gap-3 sm:flex-row lg:self-start">
          <ButtonLink href="/book" className="sm:min-w-56">
            Book a class · {formatPeso(settings.classPrice)}
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary">
            About the class
          </ButtonLink>
        </div>
      </section>

      {/* ===== Next open sessions (LIVE seats) ===== */}
      <section
        aria-labelledby="sessions-heading"
        className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 pb-8 pt-2 lg:px-8 lg:pb-14"
      >
        <div className="flex items-baseline justify-between">
          <h2 id="sessions-heading" className="text-2xl font-normal">
            Next open sessions
          </h2>
          <Link href="/book" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brown hover:underline">
            See all
          </Link>
        </div>
        {/* The page shows the loading cards first, then swaps in the real
            list as soon as the database answers */}
        <Suspense fallback={<SessionListLoading />}>
          <SessionList />
        </Suspense>
      </section>

      {/* ===== What's included + health note ===== */}
      <section className="mx-auto grid w-full max-w-6xl gap-3 px-5 pb-10 lg:grid-cols-2 lg:items-start lg:gap-6 lg:px-8 lg:pb-16">
        <Card>
          <h2 className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.08em]">
            What&apos;s included
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {[
              "50-minute beginner mat class",
              "Upsized matcha or coffee",
              "Small groups, only a few guests per class",
              // Price from settings, never typed in
              `Mat rental +${formatPeso(settings.matPrice)}, donated to feed stray animals`,
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.5} />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        {healthNote && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-xs leading-relaxed text-warning lg:text-sm">
            <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
            <p>{healthNote}</p>
          </div>
        )}
      </section>
    </>
  );
}

// The live list of upcoming classes (runs on every visit, never cached).
// Takes: nothing.
// Gives back: a grid of session cards, a "no classes" message, or an error
// message if the database couldn't be reached.
async function SessionList() {
  let sessions;
  try {
    sessions = await getUpcomingSessions(SESSIONS_TO_SHOW);
  } catch (error) {
    // Next.js uses special "errors" internally to pause rendering until a
    // visitor arrives. Those must be passed on, not treated as real errors.
    unstable_rethrow(error);
    // In dev mode, Next.js also runs an extra "practice" render of the page
    // and stops it early. Stopping it cancels our database call with an
    // "AbortError". That isn't a real problem (the visitor's own render
    // still loads the classes), so pass it on quietly instead of logging it.
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.error(error); // shows the real problem in the terminal
    return (
      <Card>
        <p className="text-sm text-muted">
          We couldn&apos;t load the class list right now. Please refresh the page in a moment.
        </p>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          There are no open classes in the next 4 weeks yet. Check back soon, or message us
          with Chat With Us.
        </p>
      </Card>
    );
  }

  return (
    // 1 per row on phones, 2 on tablets, 3 on laptops
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
      {sessions.map((session) => (
        <li key={session.session_id}>
          <SessionCard session={session} />
        </li>
      ))}
    </ul>
  );
}

// Grey placeholder cards shown while the live class list loads.
// Takes: nothing.
// Gives back: three pulsing empty cards (hidden from screen readers, which
// hear "Loading classes" instead).
function SessionListLoading() {
  return (
    <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
      <span className="sr-only">Loading classes…</span>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          aria-hidden="true"
          className="flex h-21.5 animate-pulse items-center gap-3.5 rounded-[20px] border border-line bg-card p-4"
        >
          <div className="size-13 rounded-[14px] bg-tan-soft" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-28 rounded bg-tan-soft" />
            <div className="h-3 w-40 rounded bg-tan-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}
