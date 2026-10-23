"use client";
// A birthday box typed as MM/DD/YYYY (Change 17, Part C).
// Where it's used: the sign-up form, "Finish your profile"
// (src/components/account/ProfileForms.tsx) and, from Part G, My Profile.
//
// Why not the browser's date picker: it accepted years like 275760. This is a
// plain text box with a number keyboard on phones. The slashes are added
// while typing ("03121998" -> "03/12/1998"). When the person leaves the box,
// it checks the date at once (parseBirthdayInput: a real calendar date, 4-digit
// year, 1900 to today). The server checks again with the same function.

import { useState, type ComponentProps } from "react";
import { BIRTHDAY_ERROR, parseBirthdayInput } from "@/lib/validation";
import { Input } from "./Input";

type BirthdayInputProps = Omit<ComponentProps<"input">, "type" | "defaultValue" | "value" | "onChange"> & {
  label?: string;
  name: string;
  defaultValue?: string; // MM/DD/YYYY
  hint?: string;
  error?: string; // the server's message, if the form came back with one
};

// Adds the slashes as the person types.
// Takes: what's in the box. Gives back: the digits with "/" after the month
// and the day, at most MM/DD/YYYY (10 characters).
function withSlashes(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// The birthday box.
// Takes: label (default "Birthday"), name, the starting value, a hint and the
// server's error, plus normal <input> attributes (required...).
// Gives back: the labelled box. Its own message (after leaving the box)
// shows until it's fixed; otherwise the server's error.
export function BirthdayInput({ label = "Birthday", name, defaultValue = "", hint, error, ...props }: BirthdayInputProps) {
  const [value, setValue] = useState(defaultValue);
  // The browser-side message (null = no problem found, or not checked yet)
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <Input
      label={label}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="MM/DD/YYYY"
      maxLength={10}
      value={value}
      onChange={(event) => {
        setValue(withSlashes(event.target.value));
        setLocalError(null); // typing again clears the old message
      }}
      onBlur={() => {
        // Only check a box that has something in it (empty = "required" handles it)
        if (value && !parseBirthdayInput(value)) setLocalError(BIRTHDAY_ERROR);
      }}
      hint={hint ?? "MM/DD/YYYY, for example 03/12/1998."}
      error={localError ?? error}
      {...props}
    />
  );
}
