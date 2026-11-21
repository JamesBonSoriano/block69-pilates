"use client";
// A pop-up box (a real <dialog>) whose contents the SERVER drew, opened by a
// link that adds something to the address (e.g. ?view=<booking id>).
// Where it's used (Version 1.9): My Bookings (View / Manage a booking) and
// Payments (the receipt), so those open in a pop-up instead of a panel at the
// top or a new page.
//
// How it works:
//   - the page sees ?view=... in the address and draws this box with the
//     booking inside it (so the data is always loaded on the server, with
//     the same owner checks as before)
//   - when this box appears, it opens itself as a modal (showModal(): the
//     page behind is dimmed and can't be clicked, Escape closes it)
//   - closing it (X button, Escape or a click on the dimmed area) goes to
//     closeHref, the same page without ?view=..., without scrolling to the top
// Without JavaScript the box still shows (it starts "open"), and the X is a
// plain link to closeHref.

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// The pop-up box.
// Takes: its heading, where to go when it closes, optional extra classes
// (e.g. a narrower width for receipts), and what goes inside.
// Gives back: the <dialog>, opened as a modal.
export function RouteModal({
  title,
  closeHref,
  className,
  children,
}: {
  title: string;
  closeHref: string;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  // True while we close the plain box only to reopen it as a modal, so that
  // one "close" event doesn't leave the page.
  const reopening = useRef(false);

  // Open as a real modal once the box is on the screen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // It starts with the "open" attribute (for no-JavaScript visitors), but
    // showModal() only works on a closed dialog: close it quietly first.
    if (dialog.open && !dialog.matches(":modal")) {
      reopening.current = true;
      dialog.close();
    }
    if (!dialog.open) dialog.showModal();
  }, []);

  // Leaves the pop-up: back to the page address without the ?view=... part.
  function goBack() {
    if (reopening.current) {
      reopening.current = false; // that was our own quiet close
      return;
    }
    router.replace(closeHref, { scroll: false });
  }

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby={titleId}
      // Escape (or the X) fires "close": update the address to match
      onClose={goBack}
      // A click on the dimmed area outside the box closes it too
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-line bg-cream p-5 text-ink backdrop:bg-ink/50 sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-heading text-lg">
          {title}
        </h2>
        {/* A real link (works without JavaScript); with JavaScript it closes
            the dialog, which runs goBack() above */}
        <Link
          href={closeHref}
          scroll={false}
          replace
          aria-label="Close"
          onClick={(event) => {
            event.preventDefault();
            dialogRef.current?.close();
          }}
          className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-brown hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-brown"
        >
          <X aria-hidden="true" className="size-5" />
        </Link>
      </div>
      {children}
    </dialog>
  );
}
