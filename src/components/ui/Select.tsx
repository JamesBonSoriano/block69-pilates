// A drop-down list with its label above it (looks like Input).
// Where it's used: forms with a fixed list of choices, e.g. the drink choice in
// booking step 2, and the admin filters (session, status).

import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { FieldHelp, FieldLabel, fieldBoxClasses } from "./field";

// One choice in the list.
export type SelectOption = { value: string; label: string };

type SelectProps = ComponentProps<"select"> & {
  label: string;
  name: string; // also used as the id if no id is given
  options: SelectOption[];
  placeholder?: string; // e.g. "Choose a drink": shown first, can't be picked
  hint?: string;
  error?: string;
};

// A labelled drop-down.
// Takes: label, name, the options, an optional placeholder / hint / error,
// and any normal <select> attributes (value, onChange, required, ...).
// Gives back: the label, the drop-down (with an arrow icon) and the help text.
export function Select({
  label,
  name,
  id,
  options,
  placeholder,
  hint,
  error,
  className,
  required,
  ...props
}: SelectProps) {
  const selectId = id ?? name;
  const helpId = `${selectId}-help`;

  // With a placeholder and no chosen value, start on the placeholder
  const startsOnPlaceholder =
    placeholder !== undefined && props.value === undefined && props.defaultValue === undefined;

  return (
    <div className={className}>
      <FieldLabel htmlFor={selectId} optional={!required}>
        {label}
      </FieldLabel>
      <div className="relative">
        <select
          id={selectId}
          name={name}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          defaultValue={startsOnPlaceholder ? "" : undefined}
          // appearance-none hides the browser's own arrow; pr-10 leaves room for ours
          className={fieldBoxClasses(Boolean(error), "appearance-none pr-10")}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* Decorative arrow; pointer-events-none lets clicks reach the drop-down */}
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-brown"
        />
      </div>
      <FieldHelp id={helpId} hint={hint} error={error} />
    </div>
  );
}
