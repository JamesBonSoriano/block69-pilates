"use client";
// Shares unsaved editor text with the preview of the current content section.
import { createContext, useContext, useState, type ReactNode } from "react";
import { ContentText } from "@/components/content/ContentText";

type Draft = { title: string; body: string };
type PreviewBlock = Draft & { id: string; name: string };
const DraftContext = createContext<(id: string, draft: Partial<Draft>) => void>(() => {});

// Gives an editor a way to update its preview without saving.
export function useContentPreview() {
  return useContext(DraftContext);
}

// Displays all blocks on this page together, using unsaved values where present.
export function ContentSectionPreview({ blocks, fillIns, children }: {
  blocks: PreviewBlock[];
  fillIns: Record<string, string>;
  children: ReactNode;
}) {
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({});
  // Match the public pages' fill-in syntax and keep unknown words visible.
  const fill = (value: string) => value.replace(/\{([a-z_]+)\}/g, (whole, name: string) => fillIns[name] ?? whole);

  return (
    <DraftContext.Provider value={(id, draft) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...draft } }))}>
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
