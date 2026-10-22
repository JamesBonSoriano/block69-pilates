// Pieces shared by the form fields (Input, Select, Checkbox) so they all look
// the same: the label above, the field box, and the help / error text below.
// Where it's used: Input.tsx, Select.tsx and Checkbox.tsx in this folder.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The look of a text box or drop-down (CLAUDE.md section 7: rounded 12px,
// white, tan border).
// Takes: whether the field has an error, and any extra classes.
// Gives back: one class string.
export function fieldBoxClasses(hasError: boolean, className?: string): string {
  return cn(
    "block min-h-11 w-full rounded-xl border bg-white px-3.5 py-3 text-ink",
    // 16px text on phones stops iPhones from zooming in when the field is
    // tapped; 14px on bigger screens to match the mockups
    "text-base sm:text-sm",
    "placeholder:text-muted/70",
    "focus:border-brown focus:outline-none focus:ring-2 focus:ring-brown/20",
    "disabled:cursor-not-allowed disabled:bg-card disabled:text-muted",
    hasError ? "border-error" : "border-line",
    className,
  );
}

// The label shown above a field.
// Takes: the field's id (so clicking the label focuses the field) and the text.
// Gives back: a <label>. Adds " (optional)" when the field isn't required.
export function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-brown">
      {children}
      {optional && <span className="font-normal text-muted"> (optional)</span>}
    </label>
  );
}

// The small text under a field: an error (red) if there is one, otherwise a hint.
// Takes: the id to give it (the field points to it with aria-describedby, so
// screen readers read it out), plus the hint and/or error text.
// Gives back: a <p>, or nothing if there's no hint or error.
export function FieldHelp({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: string;
  error?: string;
}) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 text-xs text-error">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-xs text-muted">
        {hint}
      </p>
    );
  }
  return null;
}
