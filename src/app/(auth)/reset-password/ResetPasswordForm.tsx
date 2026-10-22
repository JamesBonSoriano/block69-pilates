"use client";
// The "choose a new password" form: new password + type it again.
// Where it's used: src/app/(auth)/reset-password/page.tsx, after someone
// opens the link in their reset email.
// The server (updatePassword in src/lib/auth/actions.ts) checks and saves it.

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { updatePassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/errors";
import { emptyFormState } from "@/lib/auth/form-state";

// The new-password form.
// Takes: nothing.
// Gives back: the form, or a success message with a link to My Account.
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, emptyFormState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">{state.success}</FormMessage>
        <ButtonLink href="/account" fullWidth>
          Go to My Account
        </ButtonLink>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={errors.password}
      />
      <Input
        label="Type it again"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirm_password}
      />
      <Button type="submit" fullWidth disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
