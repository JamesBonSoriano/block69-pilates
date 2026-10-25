// Admin Content, one section: /admin/content/<section>
// (home, about, booking, policies or footer)
// Where it's used: the cards on the Content hub (/admin/content).
// Version 1.4 (PDF page 24): only this section's text blocks and photos,
// with a Back link to the hub. The "Fill-in words" sidebar was removed; the
// editor's preview still shows what words like {class_price} turn into.
//
// Each block has its own Save (saveContent) and the photo spots have an
// upload (SiteImageUpload -> the public "site-images" bucket). Saving clears
// the cached page text (updateTag("site-content")), so the change shows on
// the website straight away.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + RLS (only
// admins may change site_content or upload to site-images).

import { ExternalLink, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminBackLink, AdminCard, AdminLoadError, AdminLoading, AdminOverline, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { ContentBlockEditor } from "@/components/admin/ContentBlockEditor";
import { SiteImageUpload } from "@/components/admin/SiteImageUpload";
import {
  BLOCK_NAMES,
  PHOTO_SPOTS,
  byNumberedSection,
  findContentSection,
  hasPlaceholder,
  isEditableBlock,
  sectionName,
} from "@/lib/admin/content-sections";
import { requireAdmin } from "@/lib/auth/user";
import { cn } from "@/lib/cn";
import { fillInValues } from "@/lib/content-text";
import { getAllSiteContent } from "@/lib/data/admin-setup";
import { getPublicSettings } from "@/lib/data/settings";
import { siteImageUrl } from "@/lib/site-images";
import type { SiteContentRow } from "@/types/app";

export const metadata: Metadata = { title: "Content · Admin" };

// The section page.
// Takes: params (the section key from the address).
// Gives back: the Back link, then the live part in <Suspense>.
export default function AdminContentSectionPage({ params }: PageProps<"/admin/content/[section]">) {
  return (
    <AdminPage>
      <AdminBackLink href="/admin/content" label="All sections" />
      <Suspense fallback={<AdminLoading label="the page text" />}>
        <SectionBody params={params} />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the heading and one editor per block.
// Takes: the params promise. Gives back: the heading and the block cards,
// or the "page not found" page for an unknown section.
async function SectionBody({ params }: { params: PageProps<"/admin/content/[section]">["params"] }) {
  await requireAdmin();
  const section = findContentSection((await params).section);
  if (!section) notFound();

  let blocks: SiteContentRow[];
  let fillIns: Record<string, string>;
  try {
    const [content, settings] = await Promise.all([getAllSiteContent(), getPublicSettings()]);
    blocks = content
      .filter((row) => row.page === section.key && isEditableBlock(row))
      .sort(byNumberedSection);
    // For the editor's preview of words like {class_price}
    fillIns = fillInValues(settings);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the page text" />;
  }
  const placeholders = blocks.filter(hasPlaceholder).length;

  return (
    <>
      <AdminPageHeader
        overline="Content"
        title={section.label}
        intro={section.about}
        actions={
          <Link
            href={section.where}
            target="_blank"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brown px-4 text-sm font-semibold text-brown hover:bg-admin-bg"
          >
            Open the page
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        }
      />

      {placeholders > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            {placeholders} block{placeholders === 1 ? "" : "s"} in this section still {placeholders === 1 ? "has" : "have"} a
            [PLACEHOLDER].
          </p>
        </div>
      )}
      {blocks.length === 0 && <AdminCard className="text-sm text-muted">This section has no text blocks.</AdminCard>}

      {blocks.map((block) => {
        const key = `${block.page}/${block.section}`;
        const photoLabel = PHOTO_SPOTS[key];
        return (
          <AdminCard key={block.id} className="flex flex-col gap-4">
            <AdminOverline as="h2">{BLOCK_NAMES[key] ?? sectionName(block.section)}</AdminOverline>
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
    </>
  );
}
