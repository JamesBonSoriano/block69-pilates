"use client";
// The forms on My Profile and on the "Finish your profile" page:
//   ProfileField       one editable detail (name, mobile, Instagram, and since
//                      Change 17 the birthday): shown as text with a pen icon;
//                      the pen turns it into an input with Save and Cancel
//                      (Revisions part 1, item 7)
//   FinishProfileForm  the missing mobile number / birthday (/account/finish-profile)
// Where it's used: src/app/(client)/account/profile/page.tsx and
// src/app/(client)/account/finish-profile/page.tsx.
//
// "use client" = they switch between showing and editing, and show "Saving…"
// and errors without a page reload. The work happens in Server Actions
// (src/lib/account/actions.ts), which check everything again.
// (Change email, Change password, Deactivate and Delete are in
// AccountSettingsForms.tsx.)

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { finishProfile, updateProfileField } from "@/lib/account/actions";
import { type AccountFormState, emptyAccountFormState } from "@/lib/account/form-state";
import { formatBirthdayLong } from "@/lib/format";
import { formatBirthdayInput } from "@/lib/validation";

// ---------------------------------------------------------------------------
// One editable detail
// ---------------------------------------------------------------------------

type ProfileFieldProps = {
  // which detail (the action checks it again). "birthday" (Change 17) is
  // shown as "January 15, 2000" and typed as MM/DD/YYYY.
  field: "full_name" | "mobile" | "instagram" | "birthday";
  label: string; // e.g. "Mobile number"
  initialValue: string; // the saved value ("" if none)
  optional?: boolean; // shows "(optional)" and allows an empty value
  type?: "text" | "tel";
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
};

// One detail with a pen icon.
// Takes: the props above.
// Gives back: the label and the saved value with a pen button; after the pen
// is pressed, an input with Save and Cancel. Saving closes the input and
// shows the new value.
export function ProfileField({
  field,
  label,
  initialValue,
  optional = false,
  type = "text",
  autoComplete,
  placeholder,
  maxLength,
}: ProfileFieldProps) {
  // Is the input open?
  const [editing, setEditing] = useState(false);
  // The value shown when not editing (updated after a save)
  const [saved, setSaved] = useState(initialValue);
  const penRef = useRef<HTMLButtonElement>(null);
  // Should the keyboard focus go back to the pen once the input closes?
  const focusPenRef = useRef(false);
  const labelId = useId();

  // Sends the form to updateProfileField() on the server. When it worked:
  // show the new value, close the input, and put the focus back on the pen.
  // Takes: the previous state and the form. Gives back: the server's answer.
  const [state, formAction, pending] = useActionState(
    async (previous: AccountFormState, formData: FormData) => {
      const result = await updateProfileField(previous, formData);
      if (result.success) {
        setSaved(result.values?.value ?? "");
        focusPenRef.current = true;
        setEditing(false);
      }
      return result;
    },
    emptyAccountFormState,
  );

  // Instagram is saved without the "@"; show it with one. The birthday is
  // saved as "YYYY-MM-DD"; show it in words.
  const shown =
    field === "instagram" && saved
      ? `@${saved.replace(/^@/, "")}`
      : field === "birthday" && saved
        ? formatBirthdayLong(saved)
        : saved;

  // When the input closes after Save or Cancel, keyboard users carry on
  // from the pen button (not from the top of the page)
  useEffect(() => {
    if (!editing && focusPenRef.current) {
      focusPenRef.current = false;
      penRef.current?.focus();
    }
  }, [editing]);

  // Closes the input without saving.
  function cancel() {
    focusPenRef.current = true;
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 border-b border-line py-4 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-xs font-semibold text-brown">
            {label} {optional && <span className="font-normal text-muted">(optional)</span>}
          </p>
          <p className="break-words text-base text-ink sm:text-sm">
            {shown || <span className="text-muted">Not added yet</span>}
          </p>
          {state.success && (
            <p role="status" className="text-xs font-semibold text-success">
              {state.success}
            </p>
          )}
        </div>
        <button
          ref={penRef}
          type="button"
          onClick={() => setEditing(true)}
          // Icon-only button: the label says which detail it edits
          aria-label={`Edit ${label.toLowerCase()}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-brown hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
        >
          <Pencil aria-hidden="true" className="size-4.5" />
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
      <input type="hidden" name="field" value={field} />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {field === "birthday" ? (
        // Typed MM/DD/YYYY (src/components/ui/BirthdayInput.tsx)
        <BirthdayInput
          label={label}
          name="value"
          id="profile-birthday"
          required
          // After an error, keep what they typed; otherwise the saved date
          defaultValue={state.error || state.fieldErrors ? (state.values?.value ?? "") : formatBirthdayInput(saved)}
          error={state.fieldErrors?.value}
          autoFocus
        />
      ) : (
        <Input
          label={label}
          name="value"
          // Each detail has its own id (they all send "value")
          id={`profile-${field}`}
          type={type}
          inputMode={type === "tel" ? "tel" : undefined}
          autoComplete={autoComplete}
          autoCapitalize={field === "instagram" ? "none" : undefined}
          placeholder={placeholder}
          maxLength={maxLength}
          required={!optional}
          // After an error, keep what they typed; otherwise start from the saved value
          defaultValue={state.error || state.fieldErrors ? (state.values?.value ?? "") : shown}
          error={state.fieldErrors?.value}
          autoFocus
        />
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Finish your profile (Change 17)
// ---------------------------------------------------------------------------

// The "Finish your profile" form: only the details that are missing.
// Takes: next = the safe page to go on to afterwards (or null), and missing =
// which details to ask for.
// Gives back: those fields and a "Save and continue" button. When it works
// the server sends them on; on a problem it shows the errors and keeps what
// was typed.
export function FinishProfileForm({
  next,
  missing,
}: {
  next: string | null;
  missing: { fullName: boolean; mobile: boolean; birthday: boolean };
}) {
  const [state, formAction, pending] = useActionState(finishProfile, emptyAccountFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      {missing.fullName && (
        <Input
          label="Full name"
          name="full_name"
          autoComplete="name"
          maxLength={120}
          required
          defaultValue={values.full_name}
          error={errors.full_name}
        />
      )}
      {missing.mobile && (
        <Input
          label="Mobile number"
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          required
          defaultValue={values.mobile}
          error={errors.mobile}
          hint="11 digits starting with 09. The cafe uses it to reach you about your class."
        />
      )}
      {missing.birthday && (
        // key: after an error, start from what they typed
        <BirthdayInput
          key={values.birthday ?? ""}
          name="birthday"
          required
          defaultValue={values.birthday}
          error={errors.birthday}
        />
      )}
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
