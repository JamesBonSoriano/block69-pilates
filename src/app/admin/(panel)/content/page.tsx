// Admin Content: /admin/content
// Where it's used: the admin menu ("Content"), and the Settings page's
// placeholder box.
// No mockup for this page: it follows the admin card style.
//
// What it does: edit every block of page text (the site_content table) for
// Home, About Us (incl. the FAQ and the instructor), the booking pages (what
// to bring, cancellation policy, Registration Agreement), the Policies page
// and the footer, page by page (?page=home). Each block has its own Save
// (saveContent) with a live preview of the fill-in words, and the four photo
// spots have an upload (SiteImageUpload -> the public "site-images" bucket).
// Blocks the website stopped showing in Change 17 are hidden (HIDDEN_BLOCKS).
// Saving clears the cached page text (updateTag("site-content")), so the
// change shows on the website straight away.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + RLS (only
// admins may change site_content or upload to site-images).

import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { ContentBlockEditor } from "@/components/admin/ContentBlockEditor";
import { SiteImageUpload } from "@/components/admin/SiteImageUpload";
import { firstParam } from "@/lib/auth/safe-next";
import { requireAdmin } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { fillInValues } from "@/lib/content-text";
import { getAllSiteContent } from "@/lib/data/admin-setup";
import { getPublicSettings } from "@/lib/data/settings";
import { siteImageUrl } from "@/lib/site-images";
import type { SiteContentRow } from "@/types/app";

export const metadata: Metadata = { title: "Content · Admin" };

// The page tabs: the site_content "page" value, its name, and where it shows.
const PAGES = [
  { key: "home", label: "Home", where: "/" },
  { key: "about", label: "About Us", where: "/about" },
  { key: "booking", label: "Booking & policy", where: "/book" },
  { key: "policies", label: "Policies page", where: "/policies" },
  { key: "footer", label: "Footer", where: "/" },
] as const;
type PageKey = (typeof PAGES)[number]["key"];

// Friendly names for the blocks (page/section). Blocks not listed here use
// their section name ("health_note" -> "Health note").
const BLOCK_NAMES: Record<string, string> = {
  "home/hero": "Top of the page (hero)",
  "home/hero_kicker": "Small line above the hero title",
  "home/class_details": "Class Details & Location (the address and Maps link come from Settings)",
  "home/mat_note": "Mat rental line (in Class Details & Location)",
  "home/included": "What's included",
  "home/how_it_works": "How it works (heading)",
  "home/cta": "Book now box (bottom)",
  "home/health_safety": "Health and Safety Information (bottom of Home)",
  "about/cafe": "The cafe",
  "about/instructor": "The instructor (small heading and bio)",
  "about/instructor_name": "The instructor's name (title) and description",
  "about/class": "The class",
  "about/schedule": "Schedule note",
  "about/visit": "Visit us",
  "about/contact": "Contact",
  "about/health_safety": "Health and safety",
  "about/policy_summary": "Short policy",
  "booking/what_to_bring": "What to bring (booking step 3)",
  "booking/cancellation_policy": "Cancellation policy (booking step 3 and My Bookings)",
  "booking/agreement": "Registration Agreement (booking step 3)",
  "policies/intro": "Introduction",
  "footer/strays_note": "Stray animals note",
};

// Blocks the website no longer shows (Change 17). They stay in the database,
// as agreed, but are left off this page so nobody edits text nobody sees.
// Home: "About the class" + its 3 cards and the old location block became
// "Class Details & Location"; the small health note became "Health and
// Safety Information".
// About Us: Health and Safety moved to Home (edit "Health and Safety
// Information" on the Home tab), and the Class Schedule section was removed.
const HIDDEN_BLOCKS = new Set([
  "home/about_class",
  "home/feature_1",
  "home/feature_2",
  "home/feature_3",
  "home/location_drink",
  "home/health_note",
  "about/health_safety",
  "about/schedule",
]);

// The photo spots (page/section) and what to call them.
const PHOTO_SPOTS: Record<string, string> = {
  "home/hero": "Home: top photo",
  "home/class_details": "Home: Class Details & Location photo",
  "about/cafe": "About Us: cafe photo",
  "about/instructor": "About Us: instructor photo",
};

// The Content page.
// Takes: searchParams (page = a tab key).
// Gives back: the heading, then the live part in <Suspense>.
export default function AdminContentPage({ searchParams }: PageProps<"/admin/content">) {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Content"
        intro="The words and photos on Home, About Us, the booking pages and the footer."
      />
      <Suspense fallback={<AdminLoading label="the page text" />}>
        <ContentBody searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: page tabs, the fill-in words, and one editor per block.
// Takes: the searchParams promise. Gives back: the cards.
async function ContentBody({ searchParams }: { searchParams: PageProps<"/admin/content">["searchParams"] }) {
  await requireAdmin();
  const pageParam = firstParam((await searchParams).page);
  const page: PageKey = PAGES.some((item) => item.key === pageParam) ? (pageParam as PageKey) : "home";
  const pageInfo = PAGES.find((item) => item.key === page) ?? PAGES[0];

  let rows: SiteContentRow[];
  let fillIns: Record<string, string>;
  try {
    const [content, settings] = await Promise.all([getAllSiteContent(), getPublicSettings()]);
    // Leave out the blocks the website no longer shows (see HIDDEN_BLOCKS)
    rows = content.filter((row) => !HIDDEN_BLOCKS.has(`${row.page}/${row.section}`));
    fillIns = fillInValues(settings);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the page text" />;
  }

  const blocks = rows.filter((row) => row.page === page).sort(byNumberedSection);
  // How many blocks on each page still have a [PLACEHOLDER]
  const placeholderCount = (key: string) =>
    rows.filter((row) => row.page === key && /\[[^\]]+\]/.test(`${row.title ?? ""}\n${row.body ?? ""}`)).length;

  return (
    <>
      {/* ---- Page tabs ---- */}
      <nav aria-label="Pages">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {PAGES.map((item) => {
            const active = item.key === page;
            const count = placeholderCount(item.key);
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={item.key === "home" ? "/admin/content" : `/admin/content?page=${item.key}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown",
                    active
                      ? "border-brown bg-brown font-semibold text-card"
                      : "border-admin-active bg-white text-brown hover:bg-admin-bg",
                  )}
                >
                  {item.label}
                  {count > 0 && (
                    <span
                      className={cn("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-white text-brown" : "bg-warning-bg text-warning")}
                    >
                      {count}
                      <span className="sr-only"> with placeholders</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* ---- The blocks of this page ---- */}
        <div className="flex flex-col gap-4">
          {placeholderCount(page) > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm text-warning">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>
                {placeholderCount(page)} block{placeholderCount(page) === 1 ? "" : "s"} on this page still{" "}
                {placeholderCount(page) === 1 ? "has" : "have"} a [PLACEHOLDER] (marked below).
              </p>
            </div>
          )}
          {blocks.length === 0 && <AdminCard className="text-sm text-muted">This page has no text blocks.</AdminCard>}
          {blocks.map((block) => {
            const key = `${block.page}/${block.section}`;
            const photoLabel = PHOTO_SPOTS[key];
            return (
              <AdminCard key={block.id} className="flex flex-col gap-4">
                <div>
                  <AdminOverline as="h2">{BLOCK_NAMES[key] ?? sectionName(block.section)}</AdminOverline>
                  <p className="text-[11px] text-muted">
                    {block.page} / {block.section}
                  </p>
                </div>
                <div className={cn("grid gap-5", photoLabel && "xl:grid-cols-[minmax(0,1fr)_16rem]")}>
                  <ContentBlockEditor
                    contentId={block.id}
                    idPrefix={`${block.page}-${block.section}`}
                    title={block.title ?? ""}
                    body={block.body ?? ""}
                    hint="Each new line shows as its own paragraph or list item."
                    fillIns={fillIns}
                  />
                  {photoLabel && (
                    <SiteImageUpload
                      contentId={block.id}
                      page={block.page}
                      section={block.section}
                      label={photoLabel}
                      currentUrl={siteImageUrl(block.image_path)}
                    />
                  )}
                </div>
              </AdminCard>
            );
          })}
        </div>

        {/* ---- Fill-in words (sticky beside the blocks on laptops) ---- */}
        <AdminCard className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 className="text-base font-semibold">Fill-in words</h2>
          <p className="text-xs leading-relaxed text-muted">
            Type one of these (with the curly brackets) and the website shows the current setting instead, so text
            never goes out of date when a price changes.
          </p>
          <dl className="flex flex-col gap-2 text-[13px]">
            {Object.entries(fillIns).map(([name, value]) => (
              <div key={name} className="flex items-center justify-between gap-3 border-b border-admin-bg pb-2 last:border-b-0">
                <dt>
                  <code className="rounded bg-admin-bg px-1.5 py-0.5 text-xs text-brown">{`{${name}}`}</code>
                </dt>
                <dd className="text-right font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            Change these values on{" "}
            <Link href="/admin/pricing" className="font-semibold text-brown underline underline-offset-2">
              Pricing
            </Link>{" "}
            and{" "}
            <Link href="/admin/settings" className="font-semibold text-brown underline underline-offset-2">
              Settings
            </Link>
            .
          </p>
          <Link
            href={pageInfo.where}
            target="_blank"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brown underline underline-offset-2"
          >
            Open the {pageInfo.label} page in a new tab
          </Link>
        </AdminCard>
      </div>
    </>
  );
}

// Turns a section name into words, e.g. "faq_3" -> "FAQ 3", "health_note" -> "Health note".
// Takes: the section name. Gives back: the words.
function sectionName(section: string): string {
  const words = section.replace(/_/g, " ").replace(/^faq\b/, "FAQ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Sorts blocks so numbered ones come in number order (faq_2 before faq_10),
// and the rest alphabetically.
// Takes: two blocks. Gives back: a number for Array.sort.
function byNumberedSection(a: SiteContentRow, b: SiteContentRow): number {
  const parse = (section: string) => {
    const match = /^(.*?)_(\d+)$/.exec(section);
    return match ? { base: match[1], n: Number(match[2]) } : { base: section, n: 0 };
  };
  const x = parse(a.section);
  const y = parse(b.section);
  return x.base === y.base ? x.n - y.n : x.base.localeCompare(y.base);
}
