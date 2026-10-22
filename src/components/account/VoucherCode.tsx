"use client";
// A voucher code in a dashed box (".code" in docs/designs/Vouchers.html) with
// a Copy button next to it.
// Where it's used: My Vouchers, and the "Booking cancelled" box on My Bookings.
//
// "use client" = the Copy button uses the browser's clipboard.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// The code and its Copy button.
// Takes: the code, whether it can still be used (used / expired codes are
// shown faded, with no Copy button), and extra classes.
// Gives back: the code box (+ button).
export function VoucherCode({ code, usable = true, className }: { code: string; usable?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex min-h-11 items-center rounded-[10px] border border-dashed border-tan px-3 font-heading text-sm font-semibold tracking-wide",
          // A used or expired code is crossed out, so nobody tries it
          usable ? "text-brown" : "text-muted line-through",
        )}
      >
        {code}
      </span>
      {usable && <CopyButton text={code} />}
    </div>
  );
}

// "Copy" button: puts the text on the clipboard and says "Copied" for 2 seconds.
// Takes: the text to copy.
// Gives back: the button. Screen readers hear "Copied" (aria-live).
function CopyButton({ text }: { text: string }) {
  // "idle" -> "copied" (or "failed" if the browser blocks the clipboard)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  // Go back to "Copy" 2 seconds after copying
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  // Copies the code (only works on https:// or localhost, which we always use).
  // Takes: nothing. Gives back: nothing.
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-brown hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
    >
      {copyState === "copied" ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {/* aria-live: screen readers announce the change to "Copied" */}
      <span aria-live="polite">
        {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy"}
        <span className="sr-only"> code {text}</span>
      </span>
    </button>
  );
}
