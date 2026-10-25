"use client";
// A button that opens a small pop-up box (a <dialog>) holding a form.
// Where it's used: the Schedule page (Edit a weekly class time, Add a class
// time, Edit one dated class).
//
// The page passes the form in as children (usually an AdminActionForm), so
// the box shows "Saved." or the database's message inside it. The admin
// closes it with Close, the X, or Escape.
//
// "use client" = it opens and closes the box in the browser.

import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";

type AdminDialogButtonProps = {
  label: string; // the button text, e.g. "Edit"
  srLabel?: string; // extra words for screen readers, e.g. " Thursday 9:00 AM"
  title: string; // the box's heading
  intro?: string; // a short line under the heading
  variant?: ButtonVariant;
  className?: string; // extra classes for the button
  children: ReactNode; // the form inside the box
};

// The button and its box.
// Takes: the props above. Gives back: the button and the (closed) box.
export function AdminDialogButton({
  label,
  srLabel,
  title,
  intro,
  variant = "secondary",
  className,
  children,
}: AdminDialogButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <Button
        variant={variant}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={className}
      >
        {label}
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </Button>

      {/* <dialog> + showModal(): a real pop-up box (Escape closes it) */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-admin-line bg-white p-5 text-ink backdrop:bg-ink/50 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {intro && <p className="mt-1 text-xs text-muted">{intro}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-brown hover:bg-admin-bg focus-visible:outline-2 focus-visible:outline-brown"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
