"use client";
// The three forms on My Profile (docs/designs/Profile.html):
//   DetailsForm    name, mobile, Instagram, birthday (email shown, not editable)
//   PasswordForm   change password (asks for the current one first)
//   DeactivateForm "Deactivate my account", with a warning and a confirm step
// Where it's used: src/app/(client)/account/profile/page.tsx.
//
// "use client" = they show "Saving…", errors and the confirm step without a
// page reload. The work happens in Server Actions (src/lib/account/actions.ts).

import { TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { changePassword, deactivateAccount, updateProfile } from "@/lib/account/actions";
import { emptyAccountFormState } from "@/lib/account/form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/errors";

// ---------------------------------------------------------------------------
// Personal details
// ---------------------------------------------------------------------------

// What the details form starts with (from the profile).
type ProfileDetails = {
  fullName: string;
  email: string;
  mobile: string;
  instagram: string;
  birthday: string; // "YYYY-MM-DD" or ""
};

// The personal details form.
// Takes: the saved details.
// Gives back: the form with Save changes.
export function DetailsForm({ initial }: { initial: ProfileDetails }) {
  const [state, formAction, pending] = useActionState(updateProfile, emptyAccountFormState);
  const errors = state.fieldErrors ?? {};
  // After saving, React empties the form, so fill it back in with what was
  // sent (or the saved details the first time)
  const values = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.success && <FormMessage tone="success">{state.success}</FormMessage>}

      {/* Two columns on laptops, one on phones */}
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Full name"
          name="full_name"
          autoComplete="name"
          maxLength={120}
          required
          defaultValue={values.full_name ?? initial.fullName}
          error={errors.full_name}
          className="md:col-span-2"
        />
        {/* The email is shown, not edited: it's the login email (Supabase
            Auth), and changing it needs a confirmation email (Phase E) */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-brown">Email</p>
          <p className="flex min-h-11 items-center break-all rounded-xl border border-line bg-card px-3.5 py-3 text-base text-muted sm:text-sm">
            {initial.email}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            This is your login email. To change it, message us with Chat With Us.
          </p>
        </div>
        <Input
          label="Mobile number"
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          required
          defaultValue={values.mobile ?? initial.mobile}
          error={errors.mobile}
        />
        <Input
          label="Instagram"
          name="instagram"
          placeholder="@yourname"
          autoCapitalize="none"
          maxLength={31}
          defaultValue={values.instagram ?? initial.instagram}
          error={errors.instagram}
        />
        <Input
          label="Birthday"
          name="birthday"
          type="date"
          min="1900-01-01"
          autoComplete="bday"
          defaultValue={values.birthday ?? initial.birthday}
          error={errors.birthday}
        />
      </div>

      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

// The "Change password" part: a button that opens the form.
// Takes: nothing.
// Gives back: the button, or the form with current + new + confirm password.
// Passwords are never filled back in after sending (React empties the form).
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, emptyAccountFormState);
  // Is the form open? (Closed at first, like the mockup's single button.)
  const [open, setOpen] = useState(false);
  const errors = state.fieldErrors ?? {};

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {state.success && <FormMessage tone="success">{state.success}</FormMessage>}
        <Button variant="secondary" onClick={() => setOpen(true)} className="sm:self-start">
          Change password
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.success && <FormMessage tone="success">{state.success}</FormMessage>}
      <Input
        label="Current password"
        name="current_password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.current_password}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={errors.new_password}
        />
        <Input
          label="New password again"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirm_password}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Deactivate my account
// ---------------------------------------------------------------------------

// The "Deactivate my account" part: a red button, then a confirm step with
// a clear warning and an "I understand" tick.
// Takes: how many upcoming bookings they have (so the warning can mention them).
// Gives back: the button, or the confirm step. When it works, the action
// logs them out everywhere and opens the login page with a message.
export function DeactivateForm({ upcomingCount }: { upcomingCount: number }) {
  const [state, formAction, pending] = useActionState(deactivateAccount, emptyAccountFormState);
  // Step 1 = just the button; step 2 = the warning and confirm
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)} className="sm:self-start">
        Deactivate my account
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-error/40 bg-error-bg p-4">
      <p className="flex items-start gap-2 font-semibold text-error">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        Are you sure? Please read this first.
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink">
        <li>You&apos;ll be logged out on all your devices straight away.</li>
        <li>You won&apos;t be able to log in or book classes until the cafe reactivates your account.</li>
        {upcomingCount > 0 ? (
          <li>
            <strong>
              You have {upcomingCount} upcoming booking{upcomingCount === 1 ? "" : "s"}.
            </strong>{" "}
            {upcomingCount === 1 ? "It stays" : "They stay"} as {upcomingCount === 1 ? "it is" : "they are"} (not
            cancelled or refunded), but you won&apos;t be able to manage {upcomingCount === 1 ? "it" : "them"} online.
          </li>
        ) : (
          <li>Your past bookings and payments are kept.</li>
        )}
        <li>To come back, message the cafe with Chat With Us.</li>
      </ul>
      <Checkbox
        name="confirm"
        required
        label="I understand. Deactivate my account."
        error={state.fieldErrors?.confirm}
      />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" variant="danger" disabled={pending} className="bg-white">
          {pending ? "Deactivating…" : "Yes, deactivate my account"}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)} className="bg-white">
          Keep my account
        </Button>
      </div>
    </form>
  );
}
