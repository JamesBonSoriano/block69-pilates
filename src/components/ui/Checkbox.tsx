// A checkbox with its text next to it.
// Where it's used: the "not pregnant" check and the Registration Agreement in
// booking, "rent a mat", the email reminder setting, and admin forms.

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FieldHelp } from "./field";

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode; // the text next to the box (can include a link)
  name: string; // also used as the id if no id is given
  hint?: string;
  error?: string;
};

// A labelled checkbox.
// Takes: label, name, optional hint / error, and any normal <input> attributes
// (checked, onChange, required, ...).
// Gives back: a <label> wrapping the box and its text, so tapping the text
// ticks the box too. The whole row is at least 44px tall for easy tapping.
export function Checkbox({ label, name, id, hint, error, className, ...props }: CheckboxProps) {
  const checkboxId = id ?? name;
  const helpId = `${checkboxId}-help`;

  return (
    <div className={className}>
      <label
        htmlFor={checkboxId}
        className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-sm text-ink"
      >
        <input
          type="checkbox"
          id={checkboxId}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          // accent-primary colors the tick box (sage-dark / admin brown);
          // mt-0.5 lines it up with the text
          className={cn(
            "mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-primary",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          )}
          {...props}
        />
        <span>{label}</span>
      </label>
      <FieldHelp id={helpId} hint={hint} error={error} />
    </div>
  );
}
