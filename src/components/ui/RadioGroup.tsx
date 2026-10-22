// Radio buttons that look like tappable cards (the ".opt" boxes in
// docs/designs/PhoneBook1.html and PhoneBook2.html): a white box with a tan
// border, and a brown border + tan fill when picked.
// Where it's used: booking step 1 (pick a class) and step 2 (drink, mat,
// first time).
//
// They are REAL radio inputs inside a <fieldset>, so they work with the
// keyboard (arrow keys), screen readers and even before JavaScript loads.

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FieldHelp } from "./field";

type RadioGroupProps = {
  legend: ReactNode; // the question, shown above the cards (like a label)
  name: string; // used for the error text's id
  hint?: string;
  error?: string;
  className?: string; // layout of the cards (default: one per row), e.g. "grid grid-cols-2 gap-2"
  // "label" (default) = small like a form label; "heading" = bigger Poppins
  // text, e.g. a date on booking step 1
  legendStyle?: "label" | "heading";
  children: ReactNode; // the <RadioOption>s
};

// A group of radio cards with its question above it.
// Takes: the legend (question), the radios' name, an optional hint / error,
// classes for the list, the legend style, and the RadioOption children.
// Gives back: a <fieldset> (screen readers read the legend before each choice).
export function RadioGroup({ legend, name, hint, error, className, legendStyle = "label", children }: RadioGroupProps) {
  const helpId = `${name}-help`;
  return (
    <fieldset aria-describedby={hint || error ? helpId : undefined}>
      <legend
        className={
          legendStyle === "heading"
            ? "mb-2.5 block font-heading text-base font-semibold text-brown"
            : // Looks like FieldLabel in field.tsx
              "mb-1.5 block text-xs font-semibold text-brown"
        }
      >
        {legend}
      </legend>
      {/* className REPLACES the default one-per-row list (cn() doesn't
          remove clashing classes, so "flex" and "grid" can't be mixed) */}
      <div className={className ?? "flex flex-col gap-2"}>{children}</div>
      <FieldHelp id={helpId} hint={hint} error={error} />
    </fieldset>
  );
}

type RadioOptionProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  name: string;
  value: string;
  label: ReactNode; // the main text, e.g. "Iced matcha latte"
  description?: ReactNode; // a smaller line under it
  aside?: ReactNode; // something on the right, e.g. "+₱50 to the strays" or a badge
};

// One radio card.
// Takes: name, value, label, optional description and aside, and normal
// <input> attributes (defaultChecked, checked, onChange, disabled, required...).
// Gives back: a <label> wrapping the radio, so tapping anywhere on the card
// picks it. At least 44px tall. A disabled card is greyed out and can't be picked.
export function RadioOption({ label, description, aside, className, disabled, ...props }: RadioOptionProps) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3 text-sm text-ink",
        // Picked: brown border (ring adds the 2nd pixel without moving
        // anything) and the tan fill from the mockups
        "has-checked:border-brown has-checked:bg-tan-soft has-checked:ring-1 has-checked:ring-brown",
        // A clear outline when the radio is reached with the keyboard
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brown",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-brown",
        className,
      )}
    >
      <input
        type="radio"
        disabled={disabled}
        // accent-brown colors the dot brown; focus is shown on the whole card
        className="size-4.5 shrink-0 cursor-[inherit] accent-brown focus:outline-none"
        {...props}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      {aside && <span className="shrink-0 text-xs text-muted">{aside}</span>}
    </label>
  );
}
