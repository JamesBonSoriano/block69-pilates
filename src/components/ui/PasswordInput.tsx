"use client";
// A password box with an eye button that shows or hides what was typed
// (Change 17, Part C).
// Where it's used: the login form (src/components/auth/LoginForm.tsx) and the
// sign-up form (src/app/(auth)/signup/SignupForm.tsx).
//
// "use client" = the eye button switches the box between type="password"
// (dots) and type="text" (readable) in the browser. Nothing is saved: the
// password only ever goes to the server inside the form.

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { FieldHelp, FieldLabel, fieldBoxClasses } from "./field";

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
};

// A labelled password box with a show / hide button.
// Takes: label, name, optional hint / error, and normal <input> attributes
// (autoComplete, minLength, required...).
// Gives back: the label, the box with the eye button inside it on the
// right, and the help text.
export function PasswordInput({ label, name, id, hint, error, className, required, ...props }: PasswordInputProps) {
  // false = dots (the normal, safer way)
  const [visible, setVisible] = useState(false);
  const inputId = id ?? name;
  const helpId = `${inputId}-help`;

  return (
    <div className={className}>
      <FieldLabel htmlFor={inputId} optional={!required}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          // Phones: don't "correct" or capitalise a password shown as text
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          // pr-12: room for the eye button so the text never runs under it
          className={cn(fieldBoxClasses(Boolean(error)), "pr-12")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          // Icon-only: screen readers hear what it does, and whether it's on
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      <FieldHelp id={helpId} hint={hint} error={error} />
    </div>
  );
}
