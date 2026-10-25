// Admin Content hub: /admin/content
// Where it's used: the admin menu ("Content"), the Dashboard shortcut and
// the Settings page's placeholder box.
// Version 1.4 (PDF page 24, "too cluttered"): one card per section (Home
// page, About Us, Booking & policy, Policies page, Footer). Each card opens
// /admin/content/<section>, which edits only that section's blocks and
// photos (src/app/admin/(panel)/content/[section]/page.tsx).
// A card shows how many of its blocks still have a [PLACEHOLDER].
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + RLS.

import { BookOpenText, ChevronRight, House, PanelBottom, ScrollText, Store, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { CONTENT_SECTIONS, hasPlaceholder, isEditableBlock, type ContentSectionKey } from "@/lib/admin/content-sections";
import { requireAdmin } from "@/lib/auth/user";
import { getAllSiteContent } from "@/lib/data/admin-setup";
import type { SiteContentRow } from "@/types/app";

export const metadata: Metadata = { title: "Content · Admin" };

// The icon on each card.
const SECTION_ICONS: Record<ContentSectionKey, LucideIcon> = {
  home: House,
  about: Store,
  booking: BookOpenText,
  policies: ScrollText,
  footer: PanelBottom,
};

// The Content hub.
// Takes: nothing. Gives back: the heading, then the cards in <Suspense>.
export default function AdminContentPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Content"
        intro="Pick a section to change its words and photos."
      />
      <Suspense fallback={<AdminLoading label="the page sections" blocks={2} />}>
        <ContentHub />
      </Suspense>
    </AdminPage>
  );
}

// The live part: one card per section, with its block count.
// Takes: nothing. Gives back: the grid of cards.
async function ContentHub() {
  await requireAdmin();

  let rows: SiteContentRow[];
  try {
    rows = (await getAllSiteContent()).filter(isEditableBlock);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the page sections" />;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CONTENT_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.key];
        const blocks = rows.filter((row) => row.page === section.key);
        const placeholders = blocks.filter(hasPlaceholder).length;
        return (
          <li key={section.key}>
            <Link
              href={`/admin/content/${section.key}`}
              className="group flex h-full flex-col gap-3 rounded-2xl border border-admin-line bg-white p-5 transition-colors hover:border-brown/40 hover:bg-admin-bg/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown lg:p-6"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-admin-bg text-brown">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-heading text-base font-semibold text-heading">{section.label}</span>
                <ChevronRight aria-hidden="true" className="size-5 text-brown transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-[13px] leading-relaxed text-muted">{section.about}</span>
              <span className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted">
                {blocks.length} block{blocks.length === 1 ? "" : "s"}
                {placeholders > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 font-semibold text-warning">
                    <TriangleAlert aria-hidden="true" className="size-3" />
                    {placeholders} with [PLACEHOLDER]
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
