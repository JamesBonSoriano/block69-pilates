"use client";
// The editor for ONE block of page text on the admin Content page: a title
// box, a text box, and a live preview that shows what the fill-in words
// (like {class_price}) will become.
// Where it's used: src/app/admin/content/page.tsx (one per site_content row).
//
// Saving runs saveContent() (src/lib/admin/setup-actions.ts), which updates
// the row (RLS: admins only) and clears the cached page text, so the
// website shows the change straight away.
//
// "use client" = the preview changes as the admin types.

import { useState } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { saveContent } from "@/lib/admin/setup-actions";

type ContentBlockEditorProps = {
  contentId: string;
  idPrefix: string; // e.g. "home-hero", so every field id on the page is different
  title: string;
  body: string;
  hint?: string; // how the page uses this block, e.g. "One item per line."
  fillIns: Record<string, string>; // fill-in word -> what it shows now
};

// Matches a fill-in word like {class_price}.
const FILL_IN = /\{([a-z_]+)\}/g;

// The block editor.
// Takes: the props above.
// Gives back: the form with the two boxes, the preview and the Save button.
export function ContentBlockEditor({ contentId, idPrefix, title, body, hint, fillIns }: ContentBlockEditorProps) {
  const [text, setText] = useState(body);
  const [heading, setHeading] = useState(title);

  // Which fill-in words the text uses, and any the website doesn't know
  const used = [...`${heading}\n${text}`.matchAll(FILL_IN)].map((match) => match[1]);
  const unknown = [...new Set(used.filter((name) => !(name in fillIns)))];
  const hasPlaceholder = /\[[^\]]+\]/.test(`${heading}\n${text}`);

  // The text with every known fill-in word swapped for its value
  const preview = (value: string) =>
    value.replace(FILL_IN, (whole, name: string) => (name in fillIns ? fillIns[name] : whole));

  return (
    <AdminActionForm action={saveContent} submitLabel="Save" buttonVariant="secondary" className="gap-3">
      <input type="hidden" name="content_id" value={contentId} />
      <Input
        label="Title"
        name="title"
        id={`${idPrefix}-title`}
        value={heading}
        onChange={(event) => setHeading(event.target.value)}
        maxLength={200}
      />
      <Textarea
        label="Text"
        name="body"
        id={`${idPrefix}-body`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
        maxLength={6000}
        hint={hint}
      />

      {hasPlaceholder && (
        <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-xs text-warning">
          This block still has a [PLACEHOLDER]. It shows on the website as a dashed box until you replace it.
        </p>
      )}
      {unknown.length > 0 && (
        <p className="rounded-xl bg-error-bg px-3.5 py-2.5 text-xs text-error">
          The website doesn&apos;t know {unknown.map((name) => `{${name}}`).join(", ")}, so it will show exactly as
          typed. Check the spelling against the fill-in words list.
        </p>
      )}
      {used.length > 0 && (
        <div className="rounded-xl bg-admin-bg px-3.5 py-3 text-xs">
          <p className="mb-1 font-semibold text-brown">Preview with today&apos;s settings</p>
          {heading && <p className="font-semibold">{preview(heading)}</p>}
          <p className="whitespace-pre-line text-muted">{preview(text)}</p>
        </div>
      )}
    </AdminActionForm>
  );
}
