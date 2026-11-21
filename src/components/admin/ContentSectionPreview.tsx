"use client";
// The "Live preview" on admin Content section pages
// (src/app/admin/(panel)/content/[section]/page.tsx). It shows the admin's
// UNSAVED text as they type: each ContentBlockEditor sends its draft here
// through useContentPreview().
//
// Two kinds of preview:
//   - Home page (Version 1.9): the REAL Home page blocks, drawn by the same
//     HomeSections component the website uses, in the website's green /
//     beige colors (data-theme="client"). It sits full width under the
//     editors, so it gets the same laptop / phone layout as the real page.
//     It's "inert": its buttons and links can't be clicked (a click would
//     leave the editor and lose unsaved text).
//   - every other section: a simple text list in a side panel.

import { Eye } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ContentText } from "@/components/content/ContentText";
import { HomeSections } from "@/components/content/HomeSections";
import type { ContentBlock } from "@/lib/data/content";
import type { PublicSettings } from "@/lib/data/settings";

type Draft = { title: string; body: string };
// One block in the preview: its id, section name (e.g. "hero"), a friendly
// name for screen readers, and its saved title / text.
type PreviewBlock = Draft & { id: string; section: string; name: string };
const DraftContext = createContext<(id: string, draft: Partial<Draft>) => void>(() => {});

// What the Home page preview needs besides the blocks (Version 1.9).
export type HomePreviewData = {
  settings: PublicSettings; // prices, cafe name, address, Maps link
  content: Record<string, ContentBlock | undefined>; // every saved "home" block (photos too)
  whatToBring: ContentBlock | undefined; // booking/what_to_bring (edited on another section page)
  classDays: string; // e.g. "Thu to Sat"
};

// Gives an editor a way to update its preview without saving.
// Takes: nothing. Gives back: a function (block id, new title and / or text).
export function useContentPreview() {
  return useContext(DraftContext);
}

// The editors (children) and the preview, side by side or stacked.
// Takes: the blocks, the fill-in word values (for the text preview), the
// editors as children, and (Version 1.9) home = the Home page data when this
// is the Home page section.
// Gives back: the editors and the live preview.
export function ContentSectionPreview({ blocks, fillIns, home, children }: {
  blocks: PreviewBlock[];
  fillIns: Record<string, string>;
  home?: HomePreviewData;
  children: ReactNode;
}) {
  // Unsaved text, by block id
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({});
  const update = (id: string, draft: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...draft } }));
  // Match the public pages' fill-in syntax and keep unknown words visible.
  const fill = (value: string) => value.replace(/\{([a-z_]+)\}/g, (whole, name: string) => fillIns[name] ?? whole);

  // ---- Version 1.9: the Home page, drawn exactly like the website ----
  if (home) {
    // Saved blocks, with the unsaved title / text laid on top (photos stay)
    const content: Record<string, ContentBlock | undefined> = { ...home.content };
    for (const block of blocks) {
      const draft = { ...block, ...drafts[block.id] };
      content[block.section] = { image_path: home.content[block.section]?.image_path ?? null, title: draft.title, body: draft.body };
    }
    return (
      <DraftContext.Provider value={update}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* A shortcut down to the preview (the editors come first) */}
          <a
            href="#live-preview"
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-full px-1 text-sm font-semibold text-brown underline underline-offset-2"
          >
            <Eye aria-hidden="true" className="size-4" />
            Jump to the live preview
          </a>
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
          <section id="live-preview" aria-labelledby="live-preview-heading" className="flex min-w-0 scroll-mt-20 flex-col gap-2">
            <h2 id="live-preview-heading" className="text-base font-semibold">
              Live preview
            </h2>
            <p className="text-xs text-muted">
              How the Home page looks with the text above (unsaved changes included). Buttons don&apos;t work here.
              Photos update after an upload.
            </p>
            {/* data-theme="client": the website's green / beige colors.
                inert: nothing inside can be clicked or focused. */}
            <div
              data-theme="client"
              inert
              className="min-w-0 overflow-hidden rounded-2xl border border-admin-line bg-cream font-sans text-ink"
            >
              <HomeSections
                settings={home.settings}
                content={content}
                whatToBring={home.whatToBring}
                classDays={home.classDays}
                preview
              />
            </div>
          </section>
        </div>
      </DraftContext.Provider>
    );
  }

  // ---- Other sections: the simple text preview in a side panel ----
  return (
    <DraftContext.Provider value={update}>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
        <aside aria-label="Live preview" className="min-w-0 self-start rounded-2xl border border-admin-line bg-white p-4 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto">
          <h2 className="text-base font-semibold">Live preview</h2>
          <div className="mt-3 divide-y divide-admin-line">
            {blocks.map((block) => {
              const draft = { ...block, ...drafts[block.id] };
              return (
                <section key={block.id} aria-label={block.name} className="break-words py-3">
                  {draft.title && <h3 className="mb-1 font-heading text-sm font-semibold"><ContentText text={fill(draft.title)} /></h3>}
                  <p className="whitespace-pre-wrap text-sm text-muted"><ContentText text={fill(draft.body)} /></p>
                </section>
              );
            })}
          </div>
        </aside>
      </div>
    </DraftContext.Provider>
  );
}
