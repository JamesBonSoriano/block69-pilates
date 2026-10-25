"use client";
// A mobile number box that takes at most 11 digits (Version 1.4).
// Where it's used: the sign-up form, "Finish your profile" and the mobile
// number on My Profile (src/components/account/ProfileForms.tsx).
//
// Phones show the number keypad (inputMode "numeric"). Anything that isn't a
// digit (spaces, dashes, "+") is taken out as it's typed or pasted, so the
// 11-character limit always means 11 digits. The rule itself (11 digits
// starting with 09) is checked by isValidPhMobile() in src/lib/validation.ts,
// on the server too, and its error message explains it.

import type { ComponentProps } from "react";
import { Input } from "./Input";

// The longest mobile number we accept: 09 + 9 more digits.
const MOBILE_DIGITS = 11;

type PhoneInputProps = Omit<ComponentProps<typeof Input>, "type" | "inputMode" | "maxLength">;

// The mobile number box.
// Takes: the same props as Input (label, name, error, defaultValue...).
// Gives back: a labelled box with type "tel", the number keypad, 11 digits max.
export function PhoneInput({ placeholder = "09171234567", onInput, onPaste, ...props }: PhoneInputProps) {
  return (
    <Input
      type="tel"
      inputMode="numeric"
      maxLength={MOBILE_DIGITS}
      placeholder={placeholder}
      onInput={(event) => {
        // Keep only the digits that were typed
        const box = event.currentTarget;
        const digits = box.value.replace(/\D/g, "").slice(0, MOBILE_DIGITS);
        if (digits !== box.value) box.value = digits;
        onInput?.(event);
      }}
      onPaste={(event) => {
        // A pasted "0917 123 4567" is 13 characters, and the browser would cut
        // it at 11 BEFORE the spaces are taken out. So paste the digits ourselves.
        const pasted = event.clipboardData.getData("text");
        const digits = pasted.replace(/\D/g, "");
        if (digits !== pasted) {
          event.preventDefault();
          const box = event.currentTarget;
          box.setRangeText(digits, box.selectionStart ?? box.value.length, box.selectionEnd ?? box.value.length, "end");
          box.value = box.value.slice(0, MOBILE_DIGITS);
        }
        onPaste?.(event);
      }}
      {...props}
    />
  );
}
