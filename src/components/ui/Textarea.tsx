// A multi-line text box with its label above it (looks like Input).
// Where it's used: booking step 2 ("Injuries or medical notes"), and later
// admin forms (page text, notices).

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { FieldHelp, FieldLabel, fieldBoxClasses } from "./field";

type TextareaProps = ComponentProps<"textarea"> & {
  label: string; // the text above the box
  name: string; // the form field name; also used as the id if no id is given
  hint?: string; // grey help text under the box
  error?: string; // red error text under the box (also turns the border red)
};

// A labelled multi-line text box.
// Takes: label, name, optional hint / error, and any normal <textarea>
// attributes (rows, maxLength, defaultValue, ...).
// Gives back: the label, the text box and the help text, stacked.
export function Textarea({ label, name, id, hint, error, className, required, rows = 3, ...props }: TextareaProps) {
  const textareaId = id ?? name;
  const helpId = `${textareaId}-help`;

  return (
    <div className={className}>
      <FieldLabel htmlFor={textareaId} optional={!required}>
        {label}
      </FieldLabel>
      <textarea
        id={textareaId}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? helpId : undefined}
        // resize-y: people can make it taller, but not wider than the page
        className={cn(fieldBoxClasses(Boolean(error)), "resize-y leading-relaxed")}
        {...props}
      />
      <FieldHelp id={helpId} hint={hint} error={error} />
    </div>
  );
}
