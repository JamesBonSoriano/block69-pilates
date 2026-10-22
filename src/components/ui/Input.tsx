// A text box with its label above it (CLAUDE.md section 7).
// Where it's used: every form (login, sign up, booking details, profile,
// admin forms). Works for type="text", "email", "tel", "password", "date", ...

import type { ComponentProps } from "react";
import { FieldHelp, FieldLabel, fieldBoxClasses } from "./field";

type InputProps = ComponentProps<"input"> & {
  label: string; // the text above the box (always shown, never only a placeholder)
  name: string; // the form field name; also used as the id if no id is given
  hint?: string; // grey help text under the box
  error?: string; // red error text under the box (also turns the border red)
};

// A labelled text input.
// Takes: label, name, optional hint / error, and any normal <input> attributes.
// Gives back: the label, the input and the help text, stacked.
export function Input({ label, name, id, hint, error, className, required, ...props }: InputProps) {
  const inputId = id ?? name;
  const helpId = `${inputId}-help`;

  return (
    <div className={className}>
      <FieldLabel htmlFor={inputId} optional={!required}>
        {label}
      </FieldLabel>
      <input
        id={inputId}
        name={name}
        required={required}
        // Tells screen readers if the field has a problem, and where its help text is
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? helpId : undefined}
        className={fieldBoxClasses(Boolean(error))}
        {...props}
      />
      <FieldHelp id={helpId} hint={hint} error={error} />
    </div>
  );
}
