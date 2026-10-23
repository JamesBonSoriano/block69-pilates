"use client";
// The photo picker for one photo spot on the admin Content page (Home hero,
// Home location, About cafe, About instructor).
// Where it's used: src/app/admin/content/page.tsx.
//
// How an upload works:
//   1. The admin picks a JPEG, PNG or WebP (5 MB at most).
//   2. The BROWSER uploads it straight to the public Supabase Storage bucket
//      "site-images", as the logged-in admin. The bucket's policies
//      (migration 10) only let active admins upload, so a client can't.
//      (Server Actions only accept 1 MB, too small for photos.)
//   3. saveSiteImage() (src/lib/admin/setup-actions.ts) checks the admin
//      again, saves the new path on the block, deletes the old photo and
//      clears the cached page text, so the website shows it at once.
// Every upload gets a new file name (with the time in it), so browsers never
// keep showing the old photo from their cache.
//
// "use client" = it reads the picked file and talks to Supabase Storage.

import { ImageUp, Trash2 } from "lucide-react";
import Image from "next/image";
import { startTransition, useActionState, useId, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { emptySaveState } from "@/lib/admin/form-state";
import { removeSiteImage, saveSiteImage } from "@/lib/admin/setup-actions";
import { SITE_IMAGES_BUCKET } from "@/lib/site-images";
import { createClient } from "@/lib/supabase/client";

// The photo types the bucket accepts, and the file ending for each.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// The biggest photo the bucket accepts (5 MB, migration 10).
const MAX_BYTES = 5 * 1024 * 1024;

type SiteImageUploadProps = {
  contentId: string;
  page: string; // e.g. "home" (the folder in the bucket)
  section: string; // e.g. "hero" (the start of the file name)
  label: string; // e.g. "Home: top photo"
  currentUrl: string | null; // the photo shown now (null = the brown box)
};

// The photo picker.
// Takes: the props above.
// Gives back: the current photo, an "Upload photo" button and "Remove".
export function SiteImageUpload({ contentId, page, section, label, currentUrl }: SiteImageUploadProps) {
  const [saveState, saveAction, saving] = useActionState(saveSiteImage, emptySaveState);
  const [removeState, removeAction, removing] = useActionState(removeSiteImage, emptySaveState);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState("");
  const inputId = useId();
  const busy = uploading || saving || removing;

  // Uploads the picked photo, then saves it on the block.
  // Takes: the file input's change event. Gives back: nothing.
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!file) return;

    const ending = TYPES[file.type];
    if (!ending) {
      setProblem("Please pick a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem("That photo is bigger than 5 MB. Please make it smaller first.");
      return;
    }

    setProblem("");
    setUploading(true);
    // e.g. "home/hero-1729651234567.jpg"
    const path = `${page}/${section}-${Date.now()}.${ending}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(SITE_IMAGES_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    setUploading(false);
    if (error) {
      console.error("Photo upload failed:", error.message);
      setProblem("Sorry, the photo couldn't be uploaded. Please check you're still logged in as an admin and try again.");
      return;
    }

    // Save the new path on the block (the server checks the admin again)
    const formData = new FormData();
    formData.set("content_id", contentId);
    formData.set("path", path);
    startTransition(() => saveAction(formData));
  }

  // Removes the photo (the page shows the brown box again).
  // Takes: nothing. Gives back: nothing.
  function handleRemove() {
    const formData = new FormData();
    formData.set("content_id", contentId);
    startTransition(() => removeAction(formData));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-brown">{label}</p>
      {currentUrl ? (
        <Image
          src={currentUrl}
          alt={`Current photo: ${label}`}
          width={640}
          height={360}
          sizes="(min-width: 1024px) 400px, 100vw"
          className="h-44 w-full rounded-xl border border-admin-line object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center rounded-xl bg-gradient-to-br from-tan to-caramel text-xs font-semibold text-white">
          No photo yet (the brown box shows)
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* The real file input is hidden; the label is the visible button */}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={busy}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.25px] border-brown px-5 py-3 font-heading text-sm font-semibold leading-none text-brown hover:bg-brown/5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brown peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          <ImageUp aria-hidden="true" className="size-4" />
          {uploading ? "Uploading…" : saving ? "Saving…" : currentUrl ? "Replace photo" : "Upload photo"}
        </label>
        {currentUrl && (
          <Button variant="danger" onClick={handleRemove} disabled={busy}>
            <Trash2 aria-hidden="true" className="size-4" />
            {removing ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">JPEG, PNG or WebP, up to 5 MB. A wide photo (about 1600 × 900) looks best.</p>

      {/* The answers: a problem with the file, then the save and remove results */}
      {problem && <FormMessage tone="error">{problem}</FormMessage>}
      {[saveState, removeState].map((state, n) =>
        state.error ? (
          <FormMessage key={n} tone="error">
            {state.error}
          </FormMessage>
        ) : state.saved && !problem ? (
          <p key={`${n}-${state.savedAt}`} role="status" className="text-xs font-semibold text-success">
            {state.saved}
          </p>
        ) : null,
      )}
    </div>
  );
}
